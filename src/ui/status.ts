// Sync status pill in the header + banner for files in conflict.
import { h } from '../dom';
import { onStatus, flushNow, resolveConflict } from '../sync';
import * as store from '../store';

export function mountStatus(pill: HTMLElement, banner: HTMLElement): void {
  pill.hidden = false;
  pill.setAttribute('role', 'button');
  pill.tabIndex = 0;
  pill.title = 'Tap to sync now';
  const syncNow = () => void flushNow();
  pill.addEventListener('click', syncNow);
  pill.addEventListener('keydown', (e) => { if (e.key === 'Enter') syncNow(); });

  onStatus((s) => {
    pill.dataset.state = s.state;
    pill.textContent = s.state === 'synced' ? 'Synced' : s.detail;
    pill.title = s.detail + ' · tap to sync now';
    void renderConflicts(banner, s.conflicts);
  });
}

async function renderConflicts(banner: HTMLElement, paths: string[]): Promise<void> {
  if (!paths.length) { banner.hidden = true; banner.replaceChildren(); return; }
  const items = await Promise.all(paths.map(async (path) => {
    const rec = await store.getRec(path);
    if (!rec?.conflict) return null;
    const btns = h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => resolveConflict(path, 'mine') }, 'Keep mine'),
      h('button', { onclick: () => resolveConflict(path, 'theirs') }, 'Take GitHub version'),
    );
    return h('div', { class: 'conflict' },
      h('p', {}, h('strong', {}, path.replace(/^contexts\//, '')), ' was changed on GitHub and here. Which version do you want to keep?'),
      h('details', {},
        h('summary', {}, 'Compare'),
        h('div', { class: 'compare' },
          h('div', {}, h('h3', {}, 'Mine'), h('pre', {}, rec.content)),
          h('div', {}, h('h3', {}, 'GitHub'), h('pre', {}, rec.conflict.remoteContent)),
        ),
      ),
      btns,
    );
  }));
  banner.replaceChildren(...items.filter((x): x is HTMLDivElement => !!x));
  banner.hidden = !banner.childElementCount;
}
