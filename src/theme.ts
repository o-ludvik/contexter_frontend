// Theme: follows the system by default; the header button cycles auto -> dark -> light.
import { theme, type Theme } from './prefs';

const COLORS = { light: '#f6f7f9', dark: '#111318' };
const LABELS: Record<Theme, string> = { auto: 'Theme: system', dark: 'Theme: dark', light: 'Theme: light' };
const ICONS: Record<Theme, string> = { auto: '◐', dark: '☾', light: '☀' };

export function applyTheme(t = theme.get()): void {
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme;
  else root.dataset.theme = t;
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const media = m.getAttribute('media') ?? '';
    m.content = t === 'auto' ? (media.includes('dark') ? COLORS.dark : COLORS.light) : COLORS[t];
  }
}

export function mountThemeToggle(btn: HTMLButtonElement): void {
  const show = () => {
    const t = theme.get();
    btn.textContent = ICONS[t];
    btn.title = LABELS[t];
    btn.setAttribute('aria-label', LABELS[t]);
  };
  btn.addEventListener('click', () => {
    const order: Theme[] = ['auto', 'dark', 'light'];
    const next = order[(order.indexOf(theme.get()) + 1) % order.length];
    theme.set(next);
    applyTheme(next);
    show();
  });
  show();
}
