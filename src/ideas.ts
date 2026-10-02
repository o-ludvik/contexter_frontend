// ideas.md entry format:  - **2026-10-02 14:03** first line
//                           continuation lines indented by two spaces
const pad = (n: number) => String(n).padStart(2, '0');

export function stamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatEntry(text: string, d = new Date()): string {
  const [first, ...rest] = text.trim().replace(/\r\n?/g, '\n').split('\n');
  return [`- **${stamp(d)}** ${first}`, ...rest.map((l) => (l.trim() ? '  ' + l : ''))].join('\n');
}

export type Entry = { when: string; text: string };

/** Parse entries (newest last). Lines outside entries (headings etc.) are ignored. */
export function parseEntries(md: string): Entry[] {
  const out: Entry[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^- \*\*(\d{4}-\d\d-\d\d \d\d:\d\d)\*\*\s?(.*)$/);
    if (m) out.push({ when: m[1], text: m[2] });
    else if (out.length && (line.startsWith('  ') || line === '')) out[out.length - 1].text += '\n' + line.slice(2);
    else if (/^[-*] /.test(line)) out.push({ when: '', text: line.slice(2) });
  }
  return out.map((e) => ({ ...e, text: e.text.trimEnd() }));
}
