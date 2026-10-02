import { defineConfig, type Plugin } from 'vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const BASE = '/contexter_frontend/';

// Strict CSP, production only (dev needs inline/HMR websockets).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.github.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

// Emits sw.js from src/sw.js with the list of built files to precache and a content hash
// as cache version, so every deploy gets a fresh cache.
function serviceWorker(): Plugin {
  return {
    name: 'contexter-sw',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    generateBundle(_, bundle) {
      const publicFiles = listFiles('public')
        .map((p) => relative('public', p).split('\\').join('/'))
        .filter((p) => p !== 'auth.json'); // auth.json is fetched network-first instead
      const files = ['./', ...Object.keys(bundle), ...publicFiles].filter((f) => f !== 'sw.js');
      const hash = createHash('sha256');
      for (const f of Object.keys(bundle).sort()) {
        const item = bundle[f];
        hash.update(f).update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const f of publicFiles) hash.update(f).update(readFileSync(join('public', f)));
      const src = readFileSync('src/sw.js', 'utf8')
        .replace('__PRECACHE__', JSON.stringify(files))
        .replace('__VERSION__', hash.digest('hex').slice(0, 12));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [serviceWorker()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
