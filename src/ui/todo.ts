// Interactive checklist for a context's todo.md (used on the context page and Start session).
import { h } from '../dom';
import * as store from '../store';
import * as sync from '../sync';
import { parseTodos, toggle, addTodo, clearDone } from '../todo';

export function todoList(slug: string, opts: { compact?: boolean } = {}): { el: HTMLElement; destroy: () => void } {
  const path = sync.contextPath(slug, 'todo.md');
  const list = h('ul', { class: 'todos' });
  const input = h('input', { type: 'text', placeholder: 'Add a todo…', enterkeyhint: 'done', 'aria-label': 'New todo' });
  const clearBtn = h('button', { type: 'button', class: 'small' }, 'Clear done');
  const addForm = h('form', { class: 'row add-todo' }, input, h('button', { type: 'submit', class: 'small' }, 'Add'));
  const el = h('div', { class: 'todo-block' }, list, opts.compact ? null : addForm, opts.compact ? null : h('div', { class: 'row' }, clearBtn));

  const edit = (fn: (md: string) => string) => store.update(path, fn);

  const render = async () => {
    const { content, rec } = await store.read(path);
    const todos = parseTodos(content);
    const locked = !!rec?.conflict;
    list.replaceChildren(...todos.map((t) =>
      h('li', { class: t.done ? 'done' : '' },
        h('label', {},
          h('input', {
            type: 'checkbox', checked: t.done, disabled: locked,
            onchange: (e: Event) => void edit((md) => toggle(md, t.line, (e.target as HTMLInputElement).checked)),
          }),
          h('span', {}, t.text),
        ),
      ),
    ));
    if (!todos.length) list.append(h('li', { class: 'muted' }, 'Nothing to do.'));
    clearBtn.hidden = !todos.some((t) => t.done);
    input.disabled = locked;
  };

  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    void edit((md) => addTodo(md, text));
  });
  clearBtn.addEventListener('click', () => void edit(clearDone));

  const unsub = store.subscribe((p) => { if (p === path) void render(); });
  void render().then(() => sync.refresh(path));
  return { el, destroy: unsub };
}
