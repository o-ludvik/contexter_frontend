import './styles.css';
import { route, startRouter, render, setEnabled } from './router';
import { getToken, logout } from './auth';
import { renderLogin } from './ui/login';
import { renderRaw } from './ui/raw';
import { mountStatus } from './ui/status';
import * as sync from './sync';
import { hasPendingChanges } from './store';
import { h } from './dom';

const view = document.getElementById('view')!;
const lockBtn = document.getElementById('lock') as HTMLButtonElement;

// Temporary home until the capture screen (phase 5): contexts with links to their raw files.
route('', (_args, v) => {
  const list = h('ul', { class: 'plain' });
  v.append(h('h1', {}, 'Contexts'), list);
  const show = (slugs: string[]) =>
    list.replaceChildren(...slugs.map((slug) => h('li', {},
      h('strong', {}, slug), ' ',
      ...sync.CONTEXT_FILES.flatMap((f) => [h('a', { href: `#/raw/${sync.contextPath(slug, f)}` }, f), ' ']),
    )));
  void sync.localContexts().then(show).then(sync.refreshContexts).then(show);
});
route('raw', renderRaw);

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
