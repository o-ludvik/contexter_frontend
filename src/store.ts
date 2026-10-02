// Local, offline-first file store. The UI reads and writes only here; sync.ts moves
// changes to and from GitHub in the background.
import * as db from './db';

export type FileRec = {
  path: string;
  /** What the user sees / edits. */
  content: string;
  /** Remote blob SHA `content` was last based on; undefined = not on GitHub yet. */
  baseSha?: string;
  /** Remote content at baseSha, used to tell real remote changes from our own echoes. */
  baseContent: string;
  etag?: string;
  /** Local edits not yet pushed. */
  dirty: boolean;
  /** Set when GitHub has a different version than the one we edited. Sync pauses for this file. */
  conflict?: { remoteContent: string; remoteSha?: string };
  updatedAt: number;
};

/** A pending, already formatted entry to append to a file (ideas.md). */
export type Append = { id?: number; path: string; text: string; createdAt: number };

type Listener = (path: string) => void;
const listeners = new Set<Listener>();

/** Subscribe to local changes (edits, appends, remote refreshes). Returns an unsubscribe fn. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(path: string): void {
  for (const fn of listeners) fn(path);
}

// sync.ts registers itself here to avoid a circular import.
let onLocalChange: () => void = () => {};
export function setLocalChangeHandler(fn: () => void): void {
  onLocalChange = fn;
}

export const getRec = (path: string) => db.get<FileRec>('files', path);
export const putRec = (rec: FileRec) => db.put('files', rec);
export const allRecs = () => db.getAll<FileRec>('files');
export const allAppends = () => db.getAll<Append>('appends');

export function appendTo(base: string, entries: string[]): string {
  if (!entries.length) return base;
  const head = base.trim() ? base.replace(/\s*$/, '\n') : '# Ideas\n\n';
  return head + entries.join('\n') + '\n';
}

/** Current local view of a file: stored content plus pending appends. */
export async function read(path: string): Promise<{ content: string; rec?: FileRec; pending: number }> {
  const [rec, appends] = await Promise.all([getRec(path), allAppends()]);
  const mine = appends.filter((a) => a.path === path).map((a) => a.text);
  return { content: appendTo(rec?.content ?? '', mine), rec, pending: mine.length };
}

// Local edits to the same file run one at a time, so read-modify-write edits
// (e.g. ticking a todo then adding one) can't overwrite each other.
const queues = new Map<string, Promise<unknown>>();
function serial<T>(path: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(path) ?? Promise.resolve()).then(task, task);
  queues.set(path, run.catch(() => {}));
  return run;
}

async function writeNow(path: string, content: string): Promise<void> {
  const rec = (await getRec(path)) ?? { path, content: '', baseContent: '', dirty: false, updatedAt: 0 };
  if (rec.content === content && rec.updatedAt) return;
  await putRec({ ...rec, content, dirty: true, updatedAt: Date.now() });
  emit(path);
  onLocalChange();
}

/** Save a full-file edit locally and schedule a push. */
export function write(path: string, content: string): Promise<void> {
  return serial(path, () => writeNow(path, content));
}

/** Transform the current local content of a file (pending appends included) and save it. */
export function update(path: string, fn: (content: string) => string): Promise<void> {
  return serial(path, async () => writeNow(path, fn((await read(path)).content)));
}

/**
 * Read-modify-write a file record through the same per-file queue as local edits, so
 * background sync can't overwrite a keystroke saved in between. fn returns the new record,
 * null to delete it, or undefined to leave it unchanged. Resolves to fn's decision.
 */
export function mutate(path: string, fn: (cur: FileRec | undefined) => FileRec | null | undefined): Promise<FileRec | null | undefined> {
  return serial(path, async () => {
    const next = fn(await getRec(path));
    if (next === null) await db.del('files', path);
    else if (next) await putRec(next);
    return next;
  });
}

/** Queue an entry to append (never conflicts: it is re-applied on top of the latest remote file). */
export async function append(path: string, text: string): Promise<void> {
  await db.put('appends', { path, text, createdAt: Date.now() } satisfies Append);
  emit(path);
  onLocalChange();
}

export async function hasPendingChanges(): Promise<boolean> {
  const [recs, appends] = await Promise.all([allRecs(), allAppends()]);
  return appends.length > 0 || recs.some((r) => r.dirty || r.conflict);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return db.get<T>('kv', key);
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.put('kv', value, key);
}
