// #/new: create contexts/<slug>/ with the three files.
import { h } from '../dom';
import * as store from '../store';
import * as sync from '../sync';
import { go } from '../router';
import { formatLeftOff } from '../leftoff';
import { lastContext } from '../prefs';

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function renderNew(_args: string[], view: HTMLElement): () => void {
  const input = h('input', { type: 'text', id: 'ctx-name', placeholder: 'e.g. Side project', autocomplete: 'off', required: true });
  const preview = h('p', { class: 'muted' });
  const msg = h('p', { class: 'error', role: 'alert' });
  const form = h('form', { class: 'stack' },
    h('h1', {}, 'New context'),
    h('label', { for: 'ctx-name' }, 'Name'),
    input, preview,
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'primary' }, 'Create'), h('a', { class: 'btn', href: '#/' }, 'Cancel')),
    msg,
  );
  view.append(form);
  input.focus();
  input.addEventListener('input', () => {
    const s = slugify(input.value);
    preview.textContent = s ? `Folder: contexts/${s}/` : '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const slug = slugify(input.value);
    msg.textContent = '';
    if (!slug) { msg.textContent = 'Use at least one letter or digit.'; return; }
    const existing = await sync.refreshContexts();
    if (existing.includes(slug)) { msg.textContent = `"${slug}" already exists.`; return; }
    await store.write(sync.contextPath(slug, 'left-off.md'), formatLeftOff({ leftOff: '', next: '', questions: '' }));
    await store.write(sync.contextPath(slug, 'ideas.md'), '# Ideas\n');
    await store.write(sync.contextPath(slug, 'todo.md'), '# Todo\n');
    lastContext.set(slug);
    void sync.flushNow();
    go(`c/${encodeURIComponent(slug)}`);
  });
  return () => {};
}
