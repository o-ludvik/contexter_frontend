// left-off.md is written by End session in this shape (still plain, readable markdown):
//   # Left off
//   _Updated: 2026-10-02 14:03_
//   ## Where I left off / ## Next action / ## Open questions
// Parsing is lenient so hand edits on GitHub still work.
import { stamp } from './ideas';

export type LeftOff = { updated: string; leftOff: string; next: string; questions: string };

const SECTIONS: [Exclude<keyof LeftOff, 'updated'>, string, RegExp][] = [
  ['leftOff', 'Where I left off', /^(where i )?left off/i],
  ['next', 'Next action', /^next/i],
  ['questions', 'Open questions', /question/i],
];

export function parseLeftOff(md: string): LeftOff {
  const out: LeftOff = { updated: '', leftOff: '', next: '', questions: '' };
  out.updated = md.match(/_Updated:\s*([^_]+)_/)?.[1].trim() ?? '';
  let cur: keyof LeftOff | null = null;
  let matchedAny = false;
  const loose: string[] = [];
  for (const line of md.split('\n')) {
    const hm = line.match(/^##\s+(.*)$/);
    if (hm) {
      cur = SECTIONS.find(([, , re]) => re.test(hm[1].trim()))?.[0] ?? null;
      matchedAny ||= !!cur;
      continue;
    }
    if (/^#\s/.test(line) || /^_Updated:/.test(line)) continue;
    if (cur) out[cur] += line + '\n';
    else loose.push(line);
  }
  for (const [k] of SECTIONS) out[k] = out[k].trim();
  // Not in our shape at all: show the whole thing as "where I left off".
  if (!matchedAny) out.leftOff = loose.join('\n').trim();
  return out;
}

export function formatLeftOff(v: Omit<LeftOff, 'updated'>, d = new Date()): string {
  return `# Left off\n\n_Updated: ${stamp(d)}_\n\n` +
    SECTIONS.map(([k, title]) => `## ${title}\n${v[k].trim() || '-'}\n`).join('\n');
}

/** '-' is what we write for an empty section. */
export const isEmpty = (s: string) => !s.trim() || s.trim() === '-';
