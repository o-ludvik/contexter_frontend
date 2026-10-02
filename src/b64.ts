// Base64 <-> bytes / UTF-8 text. GitHub's Contents API uses base64 for file content.
export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const textToB64 = (text: string) => bytesToB64(new TextEncoder().encode(text));
export const b64ToText = (b64: string) => new TextDecoder().decode(b64ToBytes(b64));
