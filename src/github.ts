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

const base = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

async function api(path: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const token = await getToken();
  if (!token) throw new AuthError('Not logged in');
  const res = await fetch(base + enc(path) + (init.method === 'PUT' ? '' : `?ref=${BRANCH}`), {
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
