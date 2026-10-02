# Context Notes PWA

A tiny, snappy personal PWA for switching between work contexts. Single user.
Hosted on GitHub Pages (this repo, public). Data lives in a separate PRIVATE repo
(`notes`) and is read/written directly from the browser via the GitHub REST API.
There is no backend.

## Why it exists
I juggle several contexts (teaching, two engineering jobs, a game about misinformation).
I need a near-instant place to:
1. Dump random thoughts into the right context (2 taps max).
2. Run a "start session" ritual: see where I left off + my next action, big and clear.
3. Run an "end session" ritual: write where I left off, the next concrete action, open questions.

Speed and low friction matter more than features. No heavy UI framework unless justified.

## Data (private `contexter_backend` repo)
One folder per context, plain markdown so it's readable outside the app:

```
contexts/
  <context-slug>/
    left-off.md   # where I left off / next action / open questions (overwritten each end-session)
    ideas.md      # idea dump, append-only, each entry prefixed with a timestamp
    todo.md       # markdown checklist
```

Contexts are discovered by listing `contexts/`. The app can create a new context folder.

## Auth (no backend)
- A fine-grained GitHub token (only the `notes` repo, Contents: read & write) is
  ENCRYPTED with my password and the encrypted blob is committed to this repo
  (e.g. `auth.json`). The plain token must NEVER be committed.
- Encryption: Web Crypto, PBKDF2 (SHA-256, >= 600,000 iterations, random salt) -> AES-GCM.
- Login screen: one password field. On success, decrypt the token and keep it in
  IndexedDB/localStorage with an expiry of 7 days. After expiry, ask for the password again.
- Provide a small local helper (`tools/encrypt-token.html` or a Node script) that I run
  locally to produce `auth.json` from my token + password. It must not send anything anywhere.
- No third-party scripts or analytics (token sits in the browser).

## Sync behaviour
- Offline-first: every edit saves to IndexedDB immediately.
- Push to GitHub after a few seconds of inactivity and always on "End session".
  Don't commit on every keystroke.
- GitHub Contents API needs the file's SHA; on 409 conflict, re-fetch and merge
  (for ideas.md, merge appended entries; for others, show a simple choice).
- Show a small sync status indicator (saved locally / synced / offline / error).

## Screens (MVP)
1. **Quick capture (home)**: textarea focused on load + context picker (remember last used).
   Enter/button appends to that context's ideas.md.
2. **Context page**: tabs or sections for Left off, Ideas, Todo.
3. **Start session**: shows left-off note large, then todo list.
4. **End session**: form with three prompts (Left off / Next action / Open questions),
   saves left-off.md and syncs immediately.

## PWA
- manifest + service worker, installable on phone and desktop, works offline.
- Web Share Target so I can share text/links from other apps straight into a context's ideas.
- Mobile-first, dark mode support.

## Out of scope for now
Search, tags, multiple users, rich text, notifications. Build the MVP, I'll use it for two weeks first.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/contexter_frontend/ (needs public/auth.json)
npm run build      # type-check + build to dist/
npm run icons      # regenerate public/icons/ (no deps)
```

- Pushing to `main` deploys via `.github/workflows/deploy.yml` (Settings → Pages → Source: GitHub Actions).
- `tools/encrypt-token.html`: open locally to (re)create `public/auth.json` from a fine-grained token + password.
- Routes: `#/` capture, `#/c/<ctx>[/left-off|ideas|todo]`, `#/start/<ctx>`, `#/end/<ctx>`, `#/new`, `#/manage/<ctx>` (rename/delete), `#/raw/<path>` (plain-text editor for any file).
- Share target: on Android/desktop Chrome, install the app, then "Share → Contexter" pre-fills the capture box.
