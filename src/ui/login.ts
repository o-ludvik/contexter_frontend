import { h } from '../dom';
import { login, fetchAuthBlob } from '../auth';
import { WrongPassword } from '../crypto';

export function renderLogin(view: HTMLElement, onSuccess: () => void): void {
  const input = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true, placeholder: 'Password' });
  const msg = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'primary', type: 'submit' }, 'Unlock');

  const form = h('form', { class: 'stack login' },
    h('h1', {}, 'Unlock'),
    h('p', { class: 'muted' }, 'Enter your password to decrypt the GitHub token. You stay logged in on this device for 7 days.'),
    // Hidden username helps password managers associate the entry.
    h('input', { type: 'text', autocomplete: 'username', value: 'contexter', hidden: true, 'aria-hidden': 'true', tabindex: -1 }),
    h('label', { for: 'pw', class: 'muted' }, 'Password'),
    input,
    h('div', { class: 'row' }, btn),
    msg,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Unlocking…';
    try {
      await login(input.value);
      input.value = '';
      onSuccess();
    } catch (err) {
      msg.textContent = err instanceof WrongPassword ? 'Wrong password.' : (err as Error).message;
      input.select();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Unlock';
    }
  });

  view.replaceChildren(form);
  input.focus();

  // Warn early if the app was deployed without auth.json.
  fetchAuthBlob().then(
    (b) => { if (!b) msg.textContent = 'auth.json not found. Create it with tools/encrypt-token.html and commit it to public/.'; },
    () => { /* offline and not cached: the submit will report it */ },
  );
}
