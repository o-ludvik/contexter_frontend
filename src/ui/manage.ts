// #/manage/<slug>: rename or delete a context.
import { h } from '../dom';
import * as store from '../store';
import * as sync from '../sync';
import { go } from '../router';
import { slugify } from './newContext';
import { lastContext } from '../prefs';

export function renderManage([slug]: string[], view: HTMLElement): () => void {
  if (!slug) { go(''); return () => {}; }
  const enc = encodeURIComponent(slug);

  // Rename
  const nameInput = h('input', { type: 'text', id: 'rename', value: slug, autocomplete: 'off', required: true });
  const renamePreview = h('p', { class: 'muted' });
  const renameMsg = h('p', { role: 'alert' });
  const renameBtn = h('button', { type: 'submit', class: 'primary' }, 'Rename');
  const renameForm = h('form', { class: 'stack' },
    h('h2', {}, 'Rename'),
    h('label', { for: 'rename' }, 'New name'),
    nameInput, renamePreview,
    h('div', { class: 'row' }, renameBtn),
    renameMsg,
  );
  const updatePreview = () => {
    const s = slugify(nameInput.value);
    renamePreview.textContent = s && s !== slug ? `contexts/${slug}/ → contexts/${s}/` : '';
  };
  nameInput.addEventListener('input', updatePreview);

  // Delete
  const confirmInput = h('input', { type: 'text', id: 'confirm-del', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const delBtn = h('button', { type: 'submit', class: 'danger', disabled: true }, `Delete ${slug}`);
  const delMsg = h('p', { role: 'alert' });
  const delForm = h('form', { class: 'stack danger-zone' },
    h('h2', {}, 'Delete'),
    h('p', {}, `Removes contexts/${slug}/ and all its files from GitHub in one commit. It can be recovered from the repo's git history, but not from this app.`),
    h('label', { for: 'confirm-del' }, `Type "${slug}" to confirm`),
    confirmInput,
    h('div', { class: 'row' }, delBtn),
    delMsg,
  );
  confirmInput.addEventListener('input', () => { delBtn.disabled = confirmInput.value.trim() !== slug; });

  view.append(
    h('p', {}, h('a', { href: `#/c/${enc}` }, `← ${slug}`)),
    h('h1', {}, `Manage ${slug}`),
    renameForm,
    delForm,
  );

  const busy = (on: boolean) => {
    for (const el of [renameBtn, delBtn, nameInput, confirmInput]) el.disabled = on;
    if (!on) delBtn.disabled = confirmInput.value.trim() !== slug;
  };
  const show = (el: HTMLElement, text: string, cls: string) => { el.className = cls; el.textContent = text; };

  renameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const to = slugify(nameInput.value);
    if (!to) return show(renameMsg, 'Use at least one letter or digit.', 'error');
    if (to === slug) return show(renameMsg, 'That is already the name.', 'error');
    busy(true);
    show(renameMsg, 'Renaming…', 'muted');
    try {
      await sync.renameContext(slug, to);
      if (lastContext.get() === slug) lastContext.set(to);
      const draft = await store.kvGet(`endDraft:${slug}`);
      if (draft) { await store.kvSet(`endDraft:${to}`, draft); await store.kvSet(`endDraft:${slug}`, undefined); }
      go(`c/${encodeURIComponent(to)}`);
    } catch (err) {
      show(renameMsg, (err as Error).message, 'error');
      busy(false);
    }
  });

  delForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (confirmInput.value.trim() !== slug) return;
    busy(true);
    show(delMsg, 'Deleting…', 'muted');
    try {
      await sync.deleteContext(slug);
      if (lastContext.get() === slug) lastContext.clear();
      await store.kvSet(`endDraft:${slug}`, undefined);
      go('');
    } catch (err) {
      show(delMsg, (err as Error).message, 'error');
      busy(false);
    }
  });
  return () => {};
}
