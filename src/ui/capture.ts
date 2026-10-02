// Home: quick capture. Textarea is focused immediately; the picker remembers the last context.
// Enter (or the button) appends a timestamped entry to <context>/ideas.md. Shift+Enter = newline.
import { h } from '../dom';
import * as store from '../store';
import * as sync from '../sync';
import { formatEntry, parseEntries } from '../ideas';
import { lastContext, draft } from '../prefs';
import { takeShared } from '../share';

export function renderCapture(_args: string[], view: HTMLElement): () => void {
  let current = lastContext.get() ?? '';
  let contexts: string[] = current ? [current] : [];

  const picker = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Context' });
  const ta = h('textarea', {
    class: 'capture', rows: 4, placeholder: 'Dump a thought…', enterkeyhint: 'send',
    'aria-label': 'Idea', autocapitalize: 'sentences',
  });
  const shared = takeShared();
  const saved = draft.get();
  ta.value = shared ? (saved.trim() ? `${shared}\n${saved}` : shared) : saved;
  if (shared) draft.set(ta.value);
  const btn = h('button', { class: 'primary', type: 'submit' }, 'Add idea');
  const flash = h('span', { class: 'flash', role: 'status' });
  const recentTitle = h('h2', {});
  const recent = h('ul', { class: 'entries' });
  const links = h('div', { class: 'row links' });

  const form = h('form', { class: 'stack' },
    shared ? h('p', { class: 'share-note' }, 'Shared from another app. Pick a context, then Add.') : null,
    picker, ta, h('div', { class: 'row' }, btn, flash));
  view.append(form, links, recentTitle, recent);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  const renderPicker = () => {
    picker.replaceChildren(...contexts.map((slug) =>
      h('button', {
        type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(slug === current),
        onclick: () => { select(slug); ta.focus(); },
      }, slug),
    ));
    if (!contexts.length) picker.append(h('span', { class: 'muted' }, 'No contexts yet.'));
    picker.append(h('a', { class: 'btn chip chip-new', href: '#/new', title: 'New context' }, '+ New'));
    btn.disabled = !current;
  };

  const renderRecent = async () => {
    if (!current) { recentTitle.textContent = ''; recent.replaceChildren(); links.replaceChildren(); return; }
    links.replaceChildren(
      h('a', { class: 'btn', href: `#/start/${encodeURIComponent(current)}` }, 'Start session'),
      h('a', { class: 'btn', href: `#/c/${encodeURIComponent(current)}` }, `Open ${current}`),
    );
    const { content } = await store.read(sync.contextPath(current, 'ideas.md'));
    const entries = parseEntries(content).slice(-3).reverse();
    recentTitle.textContent = entries.length ? `Recent in ${current}` : '';
    recent.replaceChildren(...entries.map((e) => h('li', {}, e.when && h('time', {}, e.when), e.text)));
  };

  const select = (slug: string) => {
    current = slug;
    lastContext.set(slug);
    renderPicker();
    void renderRecent().then(() => sync.refresh(sync.contextPath(slug, 'ideas.md')));
  };

  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  const submit = async () => {
    const text = ta.value.trim();
    if (!text || !current) { ta.focus(); return; }
    ta.value = '';
    draft.set('');
    ta.focus();
    await store.append(sync.contextPath(current, 'ideas.md'), formatEntry(text));
    flash.textContent = `Added to ${current}`;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash.textContent = ''), 2500);
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); void submit(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void submit(); }
  });
  ta.addEventListener('input', () => draft.set(ta.value));

  const setContexts = (list: string[]) => {
    contexts = list;
    if (!contexts.includes(current)) current = contexts[0] ?? '';
    if (current) lastContext.set(current);
    renderPicker();
    void renderRecent();
  };
  renderPicker();
  void sync.localContexts().then((l) => { if (l.length) setContexts(l); return sync.refreshContexts(); }).then(setContexts);
  if (current) void sync.refresh(sync.contextPath(current, 'ideas.md'));

  const unsub = store.subscribe((p) => { if (current && p === sync.contextPath(current, 'ideas.md')) void renderRecent(); });
  return () => { unsub(); clearTimeout(flashTimer); };
}
