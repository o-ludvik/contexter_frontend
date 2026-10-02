// Plain-text editor for any file in the data repo: #/raw/contexts/teaching/todo.md
import { h } from '../dom';
import * as store from '../store';
import { refresh } from '../sync';

export function renderRaw(args: string[], view: HTMLElement): () => void {
  const path = args.join('/');
  const ta = h('textarea', { class: 'raw', spellcheck: 'true', rows: 20 });
  const note = h('p', { class: 'muted' });
  view.append(h('h1', {}, path.replace(/^contexts\//, '')), note, ta);

  // Writes in flight: don't overwrite the textarea with stale stored content meanwhile.
  let writing = 0;
  const load = async () => {
    const { content, pending, rec } = await store.read(path);
    // Pending appends are merged on push; editing the whole file meanwhile could drop them.
    ta.readOnly = pending > 0 || !!rec?.conflict;
    note.textContent = rec?.conflict ? 'Resolve the conflict above first.'
      : pending ? `${pending} new entr${pending === 1 ? 'y' : 'ies'} waiting to sync. Editing is unlocked once synced.` : '';
    if (writing === 0 && (!rec?.dirty || ta.readOnly) && ta.value !== content) ta.value = content;
  };

  ta.addEventListener('input', () => {
    writing++;
    void store.write(path, ta.value).finally(() => writing--);
  });
  const unsub = store.subscribe((p) => { if (p === path) void load(); });
  void load().then(() => refresh(path));
  return unsub;
}
