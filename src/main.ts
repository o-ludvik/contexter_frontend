import './styles.css';
import { route, startRouter, render, setEnabled } from './router';
import { getToken, logout, expiresAt } from './auth';
import { renderLogin } from './ui/login';
import { h } from './dom';
import { OWNER, REPO } from './config';

const view = document.getElementById('view')!;
const lockBtn = document.getElementById('lock') as HTMLButtonElement;

route('', (_args, v) => {
  const result = h('p', { class: 'muted' }, 'Checking repo access…');
  v.append(h('h1', {}, 'Contexter'), result);
  // Temporary phase-3 check that the decrypted token can reach the data repo.
  (async () => {
    const token = await getToken();
    const exp = await expiresAt();
    try {
      const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      });
      result.textContent = res.ok
        ? `Token works: ${OWNER}/${REPO} is reachable. Login expires ${new Date(exp!).toLocaleString()}.`
        : `GitHub said HTTP ${res.status}. Check the token's repo access and permissions.`;
    } catch {
      result.textContent = 'Offline: could not reach GitHub.';
    }
  })();
});

let routerStarted = false;
async function boot(): Promise<void> {
  if (!(await getToken())) {
    lockBtn.hidden = true;
    setEnabled(false);
    renderLogin(view, boot);
    return;
  }
  lockBtn.hidden = false;
  setEnabled(true);
  if (routerStarted) render();
  else { routerStarted = true; startRouter(); }
}

lockBtn.addEventListener('click', async () => {
  await logout();
  boot();
});

boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}
