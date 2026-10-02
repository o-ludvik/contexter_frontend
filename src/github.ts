// Thin client for the GitHub Contents API on the data repo.
import { OWNER, REPO, BRANCH } from './config';
import { getToken } from './auth';
import { b64ToText, textToB64 } from './b64';

export class AuthError extends Error {}
/** The file's SHA on GitHub no longer matches the one we sent. */
export class ConflictError extends Error {}
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type RemoteFile = { content: string; sha: string; etag?: string };
export type DirEntry = { name: string; path: string; type: 'file' | 'dir'; sha: string };

const repoBase = `https://api.github.com/repos/${OWNER}/${REPO}/`;
const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** Authenticated request to a URL under /repos/<owner>/<repo>/. */
async function repoApi(sub: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const token = await getToken();
  if (!token) throw new AuthError('Not logged in');
  const res = await fetch(repoBase + sub, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extraHeaders,
    },
  });
  if (res.status === 401) throw new AuthError('GitHub rejected the token (401)');
  return res;
}

/** Contents API request for a file or directory path. */
function api(path: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return repoApi('contents/' + enc(path) + (init.method === 'PUT' ? '' : `?ref=${BRANCH}`), init, extraHeaders);
}

async function fail(res: Response): Promise<never> {
  let msg = `GitHub HTTP ${res.status}`;
  try { msg += ': ' + (await res.json()).message; } catch { /* no body */ }
  throw new HttpError(res.status, msg);
}

/**
 * Fetch a file. Returns null if it doesn't exist, 'not-modified' when `etag` still matches
 * (304s don't count against the rate limit).
 */
export async function getFile(path: string, etag?: string): Promise<RemoteFile | null | 'not-modified'> {
  const res = await api(path, {}, etag ? { 'If-None-Match': etag } : {});
  if (res.status === 304) return 'not-modified';
  if (res.status === 404) return null;
  if (!res.ok) return fail(res);
  const json = await res.json();
  if (Array.isArray(json) || json.type !== 'file') throw new Error(`${path} is not a file`);
  return { content: b64ToText(json.content ?? ''), sha: json.sha, etag: res.headers.get('ETag') ?? undefined };
}

export async function listDir(path: string): Promise<DirEntry[]> {
  const res = await api(path);
  if (res.status === 404) return [];
  if (!res.ok) return fail(res);
  const json = await res.json();
  return Array.isArray(json) ? json.map(({ name, path, type, sha }: DirEntry) => ({ name, path, type, sha })) : [];
}

/** Create (sha undefined) or update a file. Returns the new blob SHA. */
export async function putFile(path: string, content: string, sha: string | undefined, message: string): Promise<string> {
  const res = await api(path, {
    method: 'PUT',
    body: JSON.stringify({ message, content: textToB64(content), branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
  // 409: sha mismatch. 422: sha missing for an existing file / sha for a missing one.
  if (res.status === 409 || res.status === 422) throw new ConflictError(`${path} changed on GitHub`);
  if (!res.ok) return fail(res);
  return (await res.json()).content.sha;
}

// ---- Git Data API: atomic multi-file changes (one commit) ----

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) return fail(res);
  return res.json();
}

const post = (sub: string, body: unknown, method = 'POST') =>
  repoApi(sub, { method, body: JSON.stringify(body) });

/**
 * Move every file under `from/` to `to/` (or delete them when `to` is null) in a single
 * commit. Retries if the branch moved meanwhile. Returns the moved/deleted paths
 * with their blob SHAs.
 */
export async function moveDir(from: string, to: string | null, message: string): Promise<{ path: string; sha: string }[]> {
  const prefix = from.replace(/\/?$/, '/');
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await json<{ object: { sha: string } }>(await repoApi(`git/ref/heads/${BRANCH}`));
    const head = ref.object.sha;
    const commit = await json<{ tree: { sha: string } }>(await repoApi(`git/commits/${head}`));
    const tree = await json<{ tree: { path: string; mode: string; type: string; sha: string }[]; truncated: boolean }>(
      await repoApi(`git/trees/${commit.tree.sha}?recursive=1`),
    );
    if (tree.truncated) throw new Error('Repository tree too large to modify in one commit');
    const files = tree.tree.filter((e) => e.type === 'blob' && e.path.startsWith(prefix));
    if (!files.length) throw new HttpError(404, `${from} not found on GitHub`);
    if (to && tree.tree.some((e) => e.path.startsWith(to.replace(/\/?$/, '/')))) throw new Error(`${to} already exists on GitHub`);

    const entries = files.flatMap((f) => [
      { path: f.path, mode: f.mode, type: 'blob', sha: null },
      ...(to ? [{ path: to.replace(/\/?$/, '/') + f.path.slice(prefix.length), mode: f.mode, type: 'blob', sha: f.sha }] : []),
    ]);
    const newTree = await json<{ sha: string }>(await post('git/trees', { base_tree: commit.tree.sha, tree: entries }));
    const newCommit = await json<{ sha: string }>(await post('git/commits', { message, tree: newTree.sha, parents: [head] }));
    const res = await post(`git/refs/heads/${BRANCH}`, { sha: newCommit.sha, force: false }, 'PATCH');
    if (res.ok) return files.map((f) => ({ path: f.path, sha: f.sha }));
    if (res.status !== 422 && res.status !== 409) return fail(res);
    // Someone pushed in between (not a fast-forward): rebuild on the new head.
  }
  throw new Error('GitHub kept changing; try again');
}
