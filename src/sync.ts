// Background sync between the local store and GitHub.
// - Edits are pushed after DEBOUNCE_MS of quiet, on flushNow() (End session), when the
//   page is hidden, and when the browser comes back online.
// - Appends (ideas) are re-applied on top of the latest remote file, so they never conflict.
// - Full-file edits that hit a real remote change become a `conflict` for the user to resolve.
import * as gh from './github';
import * as store from './store';
import * as db from './db';
import type { FileRec } from './store';

const DEBOUNCE_MS = 5000;
const MAX_RETRY_MS = 5 * 60_000;

export type SyncState = 'synced' | 'local' | 'syncing' | 'offline' | 'error';
export type SyncStatus = { state: SyncState; detail: string; conflicts: string[] };

let status: SyncStatus = { state: 'synced', detail: '', conflicts: [] };
const statusListeners = new Set<(s: SyncStatus) => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | undefined;
let again = false;
let lastError = '';
let retryMs = 10_000;
let onAuthLost: () => void = () => {};

export function onStatus(fn: (s: SyncStatus) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

function setStatus(s: SyncStatus): void {
  status = s;
  for (const fn of statusListeners) fn(s);
}

async function recomputeStatus(syncing = false): Promise<void> {
  const [recs, appends] = await Promise.all([store.allRecs(), store.allAppends()]);
  const conflicts = recs.filter((r) => r.conflict).map((r) => r.path);
  const pending = appends.length + recs.filter((r) => r.dirty).length;
  let state: SyncState, detail: string;
  if (conflicts.length) { state = 'error'; detail = `Conflict in ${conflicts.length} file(s)`; }
  else if (syncing) { state = 'syncing'; detail = 'Syncing…'; }
  else if (!navigator.onLine && pending) { state = 'offline'; detail = `Offline · ${pending} change(s) saved locally`; }
  else if (!navigator.onLine) { state = 'offline'; detail = 'Offline'; }
  else if (lastError) { state = 'error'; detail = lastError; }
  else if (pending) { state = 'local'; detail = 'Saved locally'; }
  else { state = 'synced'; detail = 'Synced'; }
  setStatus({ state, detail, conflicts });
}

const label = (path: string) => path.replace(/^contexts\//, '');

/** Push changes soon (debounced). */
export function schedule(delay = DEBOUNCE_MS): void {
  clearTimeout(timer);
  recomputeStatus(!!running);
  timer = setTimeout(() => void flush(), delay);
}

/** Push everything now. Resolves when done; check status for the result. */
export function flushNow(): Promise<void> {
  clearTimeout(timer);
  return flush();
}

function flush(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await flushOnce();
    } while (again);
  })().finally(() => {
    running = undefined;
  });
  return running;
}

async function flushOnce(): Promise<void> {
  if (!navigator.onLine) return recomputeStatus();
  await recomputeStatus(true);
  try {
    // Full edits first, so appends land on top of them.
    for (const rec of await store.allRecs()) if (rec.dirty && !rec.conflict) await pushEdit(rec);
    const appends = await store.allAppends();
    for (const path of new Set(appends.map((a) => a.path))) await pushAppends(path);
    lastError = '';
    retryMs = 10_000;
  } catch (e) {
    if (e instanceof gh.AuthError) {
      lastError = 'Login expired';
      onAuthLost();
    } else if (e instanceof TypeError) {
      // fetch network failure: treat as offline-ish and retry later
      lastError = 'Network error, will retry';
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), retryMs);
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    } else {
      lastError = (e as Error).message;
      console.error(e);
    }
  }
  await recomputeStatus();
}

async function fetchRemote(path: string): Promise<{ content: string; sha?: string }> {
  const r = await gh.getFile(path);
  if (r === 'not-modified') throw new Error('unexpected 304');
  return r ? { content: r.content, sha: r.sha } : { content: '' };
}

async function pushAppends(path: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const entries = (await store.allAppends()).filter((a) => a.path === path);
    if (!entries.length) return;
    const rec = (await store.getRec(path)) ?? { path, content: '', baseContent: '', dirty: false, updatedAt: 0 };
    // Unpushed full edits or an open conflict on this file: they go first / need the user.
    if (rec.dirty || rec.conflict) return;
    // Start from the last known remote version; on conflict we refetch below.
    const next = store.appendTo(rec.baseContent, entries.map((e) => e.text));
    try {
      const msg = entries.length === 1 ? `Add idea to ${label(path)}` : `Add ${entries.length} ideas to ${label(path)}`;
      const sha = await gh.putFile(path, next, rec.baseSha, msg);
      await store.putRec({ ...rec, content: next, baseContent: next, baseSha: sha, etag: undefined, dirty: false, updatedAt: Date.now() });
      for (const e of entries) await db.del('appends', e.id!);
      store.emit(path);
      return;
    } catch (e) {
      if (!(e instanceof gh.ConflictError)) throw e;
      const remote = await fetchRemote(path);
      await store.putRec({ ...rec, content: remote.content, baseContent: remote.content, baseSha: remote.sha, etag: undefined });
      store.emit(path);
    }
  }
  throw new Error(`Could not append to ${label(path)} after several attempts`);
}

async function pushEdit(rec: FileRec): Promise<void> {
  const sent = rec.content;
  try {
    const sha = await gh.putFile(rec.path, sent, rec.baseSha, `Update ${label(rec.path)}`);
    await markPushed(rec.path, sent, sha);
  } catch (e) {
    if (!(e instanceof gh.ConflictError)) throw e;
    const remote = await fetchRemote(rec.path);
    const cur = (await store.getRec(rec.path))!;
    if (remote.content === sent) {
      // Already there (e.g. our previous push landed but the response was lost).
      await markPushed(rec.path, sent, remote.sha!);
    } else if (remote.content === cur.baseContent) {
      // Only the SHA moved (no content change we haven't seen): retry on the new SHA.
      await store.putRec({ ...cur, baseSha: remote.sha });
      await pushEdit({ ...cur, baseSha: remote.sha });
    } else {
      await store.putRec({ ...cur, conflict: { remoteContent: remote.content, remoteSha: remote.sha } });
      store.emit(rec.path);
    }
  }
}

async function markPushed(path: string, sent: string, sha: string): Promise<void> {
  const cur = (await store.getRec(path))!;
  // If the user kept typing during the push, stay dirty so the newer text goes out next.
  await store.putRec({ ...cur, baseSha: sha, baseContent: sent, etag: undefined, dirty: cur.content !== sent, updatedAt: Date.now() });
  store.emit(path);
}

/** Resolve a conflict: keep the local text (overwrite GitHub) or take GitHub's version. */
export async function resolveConflict(path: string, choice: 'mine' | 'theirs'): Promise<void> {
  const rec = await store.getRec(path);
  if (!rec?.conflict) return;
  const { remoteContent, remoteSha } = rec.conflict;
  const next: FileRec = choice === 'mine'
    ? { ...rec, baseSha: remoteSha, baseContent: remoteContent, dirty: true, conflict: undefined }
    : { ...rec, content: remoteContent, baseSha: remoteSha, baseContent: remoteContent, dirty: false, conflict: undefined };
  await store.putRec(next);
  store.emit(path);
  if (choice === 'mine') await flushNow();
  else await recomputeStatus();
}

/**
 * Pull the latest version of a file if we have no local edits to it. Returns true if the
 * local copy changed. Errors (offline etc.) are swallowed: local data is still shown.
 */
export async function refresh(path: string): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const rec = await store.getRec(path);
    if (rec?.dirty || rec?.conflict) return false;
    const r = await gh.getFile(path, rec?.etag);
    if (r === 'not-modified') return false;
    if (r === null) {
      if (!rec) return false;
      // Deleted on GitHub: forget our copy unless it was never pushed.
      if (rec.baseSha) { await db.del('files', path); store.emit(path); return true; }
      return false;
    }
    const changed = r.content !== rec?.content;
    await store.putRec({ path, content: r.content, baseContent: r.content, baseSha: r.sha, etag: r.etag, dirty: false, updatedAt: Date.now() });
    if (changed) store.emit(path);
    return changed;
  } catch (e) {
    if (e instanceof gh.AuthError) onAuthLost();
    return false;
  }
}

// ---- Contexts ----

export const CONTEXT_FILES = ['left-off.md', 'ideas.md', 'todo.md'] as const;
export const contextPath = (slug: string, file: (typeof CONTEXT_FILES)[number]) => `contexts/${slug}/${file}`;

/** Locally known contexts: cached remote listing plus any created locally. */
export async function localContexts(): Promise<string[]> {
  const cached = (await store.kvGet<string[]>('contexts')) ?? [];
  const local = (await store.allRecs()).map((r) => r.path.match(/^contexts\/([^/]+)\//)?.[1]).filter((s): s is string => !!s);
  return [...new Set([...cached, ...local])].sort();
}

/** Re-list contexts/ on GitHub. Returns the merged list. */
export async function refreshContexts(): Promise<string[]> {
  if (navigator.onLine) {
    try {
      const dirs = (await gh.listDir('contexts')).filter((e) => e.type === 'dir').map((e) => e.name);
      await store.kvSet('contexts', dirs);
    } catch (e) {
      if (e instanceof gh.AuthError) onAuthLost();
    }
  }
  return localContexts();
}

export function start(authLost: () => void): void {
  onAuthLost = authLost;
  store.setLocalChangeHandler(() => schedule());
  addEventListener('online', () => { retryMs = 10_000; void flush(); });
  addEventListener('offline', () => void recomputeStatus());
  // Push right away when the app is backgrounded or closed (mobile may kill it soon after).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushNow();
  });
  // Anything left over from a previous session.
  void flush();
}
