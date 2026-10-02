// Small, non-sensitive per-device preferences in localStorage (synchronous = instant on load).
function get(key: string): string | null {
  try { return localStorage.getItem('contexter:' + key); } catch { return null; }
}
function set(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem('contexter:' + key);
    else localStorage.setItem('contexter:' + key, value);
  } catch { /* storage unavailable: fine */ }
}

export const lastContext = { get: () => get('lastContext'), set: (v: string) => set('lastContext', v) };
export const draft = { get: () => get('draft') ?? '', set: (v: string) => set('draft', v || null) };

export type Theme = 'auto' | 'light' | 'dark';
export const theme = {
  get: (): Theme => (get('theme') as Theme) || 'auto',
  set: (v: Theme) => set('theme', v === 'auto' ? null : v),
};
