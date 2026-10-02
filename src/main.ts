import './styles.css';
import { route, startRouter } from './router';

route('', (_args, view) => {
  view.innerHTML = `<h1>Contexter</h1><p class="muted">App shell is running. Screens arrive in later phases.</p>`;
});

startRouter();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}
