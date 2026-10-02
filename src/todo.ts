// todo.md: a markdown checklist. Edits change single lines in place so the rest of the
// file (headings, notes) is preserved.
export type Todo = { line: number; done: boolean; text: string };
const RE = /^(\s*[-*] \[)( |x|X)(\] )(.*)$/;

export function parseTodos(md: string): Todo[] {
  return md.split('\n').flatMap((l, i) => {
    const m = l.match(RE);
    return m ? [{ line: i, done: m[2] !== ' ', text: m[4] }] : [];
  });
}

export function toggle(md: string, line: number, done: boolean): string {
  const lines = md.split('\n');
  lines[line] = lines[line].replace(RE, (_, a, _x, b, t) => `${a}${done ? 'x' : ' '}${b}${t}`);
  return lines.join('\n');
}

/** Add an open item after the last checklist line (or at the end). */
export function addTodo(md: string, text: string): string {
  const lines = md.replace(/\s*$/, '').split('\n');
  const item = `- [ ] ${text.replace(/\s+/g, ' ').trim()}`;
  const last = parseTodos(md).at(-1)?.line;
  if (last === undefined) return (md.trim() ? lines.join('\n') + '\n\n' : '# Todo\n\n') + item + '\n';
  lines.splice(last + 1, 0, item);
  return lines.join('\n') + '\n';
}

export function clearDone(md: string): string {
  const done = new Set(parseTodos(md).filter((t) => t.done).map((t) => t.line));
  return md.split('\n').filter((_, i) => !done.has(i)).join('\n');
}
