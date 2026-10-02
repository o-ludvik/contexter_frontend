// auth.json format, produced by tools/encrypt-token.html (keep the two in sync):
// { v: 1, kdf: 'PBKDF2-SHA256', iter, salt, iv, ct }  (salt/iv/ct base64)
// key = PBKDF2(SHA-256, password, salt, iter) -> AES-GCM-256; ct = AES-GCM(token), AAD = 'contexter-v1'
import { b64ToBytes } from './b64';

export type AuthBlob = { v: 1; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string };

const AAD = new TextEncoder().encode('contexter-v1');
export const MIN_ITERATIONS = 600_000;

export class WrongPassword extends Error {}

export async function decryptToken(blob: AuthBlob, password: string): Promise<string> {
  if (blob.v !== 1 || blob.kdf !== 'PBKDF2-SHA256') throw new Error('Unsupported auth.json format');
  if (!(blob.iter >= MIN_ITERATIONS)) throw new Error('auth.json uses too few PBKDF2 iterations');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(blob.salt), iterations: blob.iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(blob.iv), additionalData: AAD }, key, b64ToBytes(blob.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new WrongPassword('Wrong password');
  }
}
