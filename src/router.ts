// Hash router: works on GitHub Pages without 404 tricks.
// Routes look like #/c/teaching -> { name: 'c', args: ['teaching'] }.
export type Route = { name: string; args: string[] };
export type Handler = (args: string[], view: HTMLElement) => void | (() => void);

const routes = new Map<string, Handler>();
let cleanup: (() => void) | void;
let enabled = true;

/** Disable while the login screen is shown so hash changes don't render app screens. */
export function setEnabled(on: boolean): void {
  enabled = on;
}

export function route(name: string, handler: Handler): void {
  routes.set(name, handler);
}

export function parse(hash = location.hash): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] ?? '', args: parts.slice(1) };
}

export function go(path: string): void {
  location.hash = '#/' + path.replace(/^\//, '');
}

export function render(): void {
  if (!enabled) return;
  const view = document.getElementById('view')!;
  const { name, args } = parse();
  const handler = routes.get(name) ?? routes.get('')!;
  if (cleanup) cleanup();
  view.replaceChildren();
  cleanup = handler(args, view);
}

export function startRouter(): void {
  addEventListener('hashchange', render);
  render();
}
