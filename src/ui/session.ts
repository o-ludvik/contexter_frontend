// Start session (#/start/<slug>): next action big, then where I left off, then todos.
// End session (#/end/<slug>): three prompts -> left-off.md, synced immediately.
import { h } from '../dom';
import * as store from '../store';
import * as sync from '../sync';
import { go } from '../router';
import { parseLeftOff, formatLeftOff, isEmpty } from '../leftoff';
import { leftOffView } from './context';
import { todoList } from './todo';
import { lastContext } from '../prefs';

export function renderStart([slug]: string[], view: HTMLElement): () => void {
  if (!slug) { go(''); return () => {}; }
  lastContext.set(slug);
  const path = sync.contextPath(slug, 'left-off.md');
  const body = h('div', {});
  const todos = todoList(slug, { compact: true });
  view.append(
    h('p', { class: 'eyebrow' }, `Starting: ${slug}`),
    body,
    h('h2', {}, 'Todo'),
    todos.el,
    h('div', { class: 'row session-actions' },
      h('a', { class: 'btn', href: `#/c/${encodeURIComponent(slug)}/todo` }, 'Edit todos'),
      h('a', { class: 'btn primary', href: `#/end/${encodeURIComponent(slug)}` }, 'End session'),
    ),
  );
  const render = async () => body.replaceChildren(leftOffView((await store.read(path)).content, slug, true));
  const unsub = store.subscribe((p) => { if (p === path) void render(); });
  void render().then(() => sync.refresh(path));
  return () => { unsub(); todos.destroy(); };
}

const draftKey = (slug: string) => `endDraft:${slug}`;

export function renderEnd([slug]: string[], view: HTMLElement): () => void {
  if (!slug) { go(''); return () => {}; }
  const path = sync.contextPath(slug, 'left-off.md');
  const field = (id: string, label: string, hint: string, rows: number) => {
    const ta = h('textarea', { id, rows, placeholder: hint });
    return { ta, el: h('div', { class: 'field' }, h('label', { for: id }, label), ta) };
  };
  const leftOff = field('eo-left', 'Where did you leave off?', 'What were you in the middle of?', 4);
  const next = field('eo-next', 'Next concrete action', 'The very first thing to do next time', 2);
  const questions = field('eo-q', 'Open questions', 'Anything unresolved (one per line)', 3);
  const msg = h('p', { role: 'status' });
  const btn = h('button', { type: 'submit', class: 'primary' }, 'Save & sync');
  const form = h('form', { class: 'stack end-form' },
    h('p', { class: 'eyebrow' }, `Ending: ${slug}`),
    leftOff.el, next.el, questions.el,
    h('div', { class: 'row' }, btn, h('a', { class: 'btn', href: `#/c/${encodeURIComponent(slug)}` }, 'Cancel')),
    msg,
  );
  view.append(form);
  const fields = { leftOff: leftOff.ta, next: next.ta, questions: questions.ta };

  // Prefill: unsaved draft if any, else the current left-off (so you edit rather than retype).
  // Local copy first, then GitHub's if it is newer and nothing has been typed yet.
  let touched = false;
  void (async () => {
    const draft = await store.kvGet<Record<keyof typeof fields, string>>(draftKey(slug));
    const fill = async () => {
      const cur = parseLeftOff((await store.read(path)).content);
      for (const k of Object.keys(fields) as (keyof typeof fields)[]) {
        fields[k].value = draft?.[k] ?? (isEmpty(cur[k]) ? '' : cur[k]);
      }
    };
    await fill();
    leftOff.ta.focus();
    if (!draft && (await sync.refresh(path)) && !touched) await fill();
  })();
  const saveDraft = () => void store.kvSet(draftKey(slug), {
    leftOff: leftOff.ta.value, next: next.ta.value, questions: questions.ta.value,
  });
  form.addEventListener('input', () => { touched = true; saveDraft(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    msg.className = 'muted';
    msg.textContent = 'Saving…';
    await store.write(path, formatLeftOff({ leftOff: leftOff.ta.value, next: next.ta.value, questions: questions.ta.value }));
    await store.kvSet(draftKey(slug), undefined);
    await sync.flushNow();
    const rec = await store.getRec(path);
    if (rec?.conflict) {
      msg.className = 'error';
      msg.textContent = 'Saved locally, but left-off.md changed on GitHub. Choose a version above.';
    } else if (rec?.dirty) {
      msg.className = 'muted';
      msg.textContent = 'Saved on this device. It will sync when you are back online.';
    } else {
      msg.className = 'ok';
      msg.textContent = 'Saved and synced. Good session!';
      setTimeout(() => { if (location.hash.startsWith('#/end/')) go(''); }, 1200);
    }
    btn.disabled = false;
  });
  return () => {};
}
