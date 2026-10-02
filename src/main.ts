import './styles.css';
import { applyTheme, mountThemeToggle } from './theme';
import { captureShareParams } from './share';

applyTheme();
captureShareParams();
mountThemeToggle(document.getElementById('theme') as HTMLButtonElement);
import { route, startRouter, render, setEnabled } from './router';
import { getToken, logout } from './auth';
import { renderLogin } from './ui/login';
import { renderRaw } from './ui/raw';
import { renderCapture } from './ui/capture';
import { renderContext } from './ui/context';
import { renderStart, renderEnd } from './ui/session';
import { renderNew } from './ui/newContext';
import { mountStatus } from './ui/status';
import * as sync from './sync';
import { hasPendingChanges } from './store';

const view = document.getElementById('view')!;
const lockBtn = document.getElementById('lock') as HTMLButtonElement;

route('', renderCapture);
route('raw', renderRaw);
route('c', renderContext);
route('start', renderStart);
route('end', renderEnd);
route('new', renderNew);

let started = false;
async function boot(): Promise<void> {
  if (!(await getToken())) {
    lockBtn.hidden = true;
    setEnabled(false);
    renderLogin(view, boot);
    return;
  }
  lockBtn.hidden = false;
  setEnabled(true);
  if (started) { render(); void sync.flushNow(); return; }
  started = true;
  mountStatus(document.getElementById('status')!, document.getElementById('conflicts')!);
  sync.start(async () => { await logout(); void boot(); });
  startRouter();
  // Warm the local cache for offline use (ETag requests: unchanged files cost nothing).
  setTimeout(() => void sync.prefetchAll(), 2000);
}

lockBtn.addEventListener('click', async () => {
  // Push what we can first; unsynced local data stays in IndexedDB either way.
  await sync.flushNow();
  if (await hasPendingChanges()) {
    if (!confirm('Some changes are not synced yet. They stay on this device and sync after you unlock again. Lock anyway?')) return;
  }
  await logout();
  boot();
});

boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}
