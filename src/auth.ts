// Token lifecycle. The decrypted token is never written in plain text: it is re-encrypted
// with a random non-extractable AES key (a CryptoKey object kept in IndexedDB), so it can't
// be copied out of storage as text. Fixed 7-day expiry from login.
import { decryptToken, type AuthBlob } from './crypto';
import * as db from './db';
import { TOKEN_TTL_MS } from './config';

type Stored = { key: CryptoKey; iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer; expiresAt: number };

let cached: { token: string; expiresAt: number } | undefined;

export async function fetchAuthBlob(): Promise<AuthBlob | null> {
  const res = await fetch('auth.json', { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load auth.json (HTTP ${res.status})`);
  return res.json();
}

export async function login(password: string): Promise<void> {
  const blob = await fetchAuthBlob();
  if (!blob) throw new Error('auth.json not found. Create it with tools/encrypt-token.html.');
  const token = await decryptToken(blob, password);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  await db.put('kv', { key, iv, ct, expiresAt } satisfies Stored, 'token');
  cached = { token, expiresAt };
}

/** The token, or null when logged out / expired. */
export async function getToken(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  cached = undefined;
  const s = await db.get<Stored>('kv', 'token');
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    await logout();
    return null;
  }
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.iv }, s.key, s.ct);
    cached = { token: new TextDecoder().decode(pt), expiresAt: s.expiresAt };
    return cached.token;
  } catch {
    await logout();
    return null;
  }
}

export async function expiresAt(): Promise<number | null> {
  return (await db.get<Stored>('kv', 'token'))?.expiresAt ?? null;
}

export async function logout(): Promise<void> {
  cached = undefined;
  await db.del('kv', 'token');
}
