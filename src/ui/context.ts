// Context page: #/c/<slug>[/<tab>] with tabs Left off / Ideas / Todo.
import { h } from '../dom';
import * as store from '../store';
import * as sync from '../sync';
import { go } from '../router';
import { parseLeftOff, isEmpty } from '../leftoff';
import { formatEntry, parseEntries } from '../ideas';
import { todoList } from './todo';
import { lastContext } from '../prefs';

const TABS = [['left-off', 'Left off'], ['ideas', 'Ideas'], ['todo', 'Todo']] as const;
type Tab = (typeof TABS)[number][0];

export function renderContext([slug, tabArg]: string[], view: HTMLElement): () => void {
  if (!slug) { go(''); return () => {}; }
  const tab: Tab = (TABS.find(([t]) => t === tabArg)?.[0]) ?? 'left-off';
  lastContext.set(slug);
  const enc = encodeURIComponent(slug);

  view.append(
    h('div', { class: 'page-head' },
      h('h1', {}, slug),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: `#/start/${enc}` }, 'Start session'),
        h('a', { class: 'btn', href: `#/end/${enc}` }, 'End session'),
      ),
    ),
    h('nav', { class: 'tabs', role: 'tablist' },
      ...TABS.map(([t, label]) => h('a', { href: `#/c/${enc}/${t}`, role: 'tab', 'aria-selected': String(t === tab) }, label)),
    ),
  );
  const panel = h('section', { class: 'panel', role: 'tabpanel' });
  view.append(panel);
  const file = tab === 'left-off' ? 'left-off.md' : tab === 'ideas' ? 'ideas.md' : 'todo.md';
  const path = sync.contextPath(slug, file);
  const rawLink = h('p', { class: 'raw-link' }, h('a', { href: `#/raw/${path}` }, `Edit ${file} as text`));

  if (tab === 'todo') {
    const t = todoList(slug);
    panel.append(t.el, rawLink);
    return t.destroy;
  }

  const body = h('div', {});
  panel.append(body);
  if (tab === 'ideas') {
    const ta = h('textarea', { rows: 2, placeholder: `Idea for ${slug}…`, enterkeyhint: 'send', 'aria-label': 'New idea' });
    const form = h('form', { class: 'stack' }, ta, h('button', { type: 'submit', class: 'primary' }, 'Add idea'));
    const submit = () => {
      const text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      void store.append(path, formatEntry(text));
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
    panel.prepend(form);
  }
  panel.append(rawLink);

  const render = async () => {
    const { content } = await store.read(path);
    if (tab === 'ideas') {
      const entries = parseEntries(content).reverse();
      body.replaceChildren(entries.length
        ? h('ul', { class: 'entries' }, ...entries.map((e) => h('li', {}, e.when && h('time', {}, e.when), e.text)))
        : h('p', { class: 'muted' }, 'No ideas yet.'));
    } else {
      body.replaceChildren(leftOffView(content, slug));
    }
  };
  const unsub = store.subscribe((p) => { if (p === path) void render(); });
  void render().then(() => sync.refresh(path));
  return unsub;
}

export function leftOffView(md: string, slug: string, big = false): HTMLElement {
  const lo = parseLeftOff(md);
  const block = (title: string, text: string, cls = '') =>
    h('div', { class: 'lo-block ' + cls }, h('h2', {}, title), isEmpty(text) ? h('p', { class: 'muted' }, '-') : h('p', { class: 'pre' }, text));
  if (!md.trim()) {
    return h('p', { class: 'muted' }, 'Nothing written yet. ', h('a', { href: `#/end/${encodeURIComponent(slug)}` }, 'End a session'), ' to record where you left off.');
  }
  const next = block('Next action', lo.next, 'next' + (big ? ' big' : ''));
  return h('div', { class: 'leftoff' + (big ? ' big' : '') },
    big ? next : null,
    block('Where I left off', lo.leftOff),
    big ? null : next,
    block('Open questions', lo.questions),
    lo.updated ? h('p', { class: 'muted small' }, `Updated ${lo.updated}`) : null,
  );
}
