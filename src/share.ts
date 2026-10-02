// Web Share Target (GET): the OS opens ./?title=…&text=…&url=…
// The shared text is parked in sessionStorage so it survives the login screen, and the
// query string is removed so a reload doesn't share it twice.
const KEY = 'contexter:shared';

export function captureShareParams(): void {
  const q = new URLSearchParams(location.search);
  if (!['title', 'text', 'url'].some((k) => q.has(k))) return;
  const title = q.get('title')?.trim() ?? '';
  const text = q.get('text')?.trim() ?? '';
  const url = q.get('url')?.trim() ?? '';
  const lines: string[] = [];
  for (const part of [title, text]) if (part && !lines.some((l) => l.includes(part))) lines.push(part);
  // Many Android apps put the link inside `text`; only add `url` if it isn't there already.
  if (url && !lines.some((l) => l.includes(url))) lines.push(url);
  try { if (lines.length) sessionStorage.setItem(KEY, lines.join('\n')); } catch { /* ignore */ }
  history.replaceState(null, '', location.pathname + '#/');
}

export function takeShared(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
