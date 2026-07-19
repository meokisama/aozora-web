<p align="center">
    <img style="width:250px;" src="./src/assets/aozora-logo.png" />
</p>

<h4 align="center">青空の下で、物語が始まる。</h4>

<p align="center">
    <img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg"/>
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"/>
</p>

## About

A browser-based EPUB reader for Japanese learners, it's a web port of the
[**Aozora**](https://github.com/meokisama/aozora) desktop reader. Everything runs
client-side: books, reading progress, bookmarks and highlights are all stored in
your browser (IndexedDB), so there's no account and no server to run.

## Features

The reading experience and interface are the same as the
[**desktop app**](https://github.com/meokisama/aozora). What's different:

- **Dictionary** — the desktop app has a built-in Yomitan-style hover dictionary
  (hold a key, hover a word, get deinflected entries from your imported Yomitan
  dictionaries). This web edition drops that and instead relies on the
  [**Yomitan**](https://yomitan.wiki/) browser extension for the same pop-up lookups.
- **Anki mining** — the desktop popup's one-click "＋ Anki" card export (via
  AnkiConnect) is not included, since it depends on the built-in dictionary. Use
  the Yomitan extension's own equivalent Anki mining instead.
- **Read-aloud (TTS)** — the desktop app speaks words and sentences through
  VOICEVOX with a karaoke-style highlight; this is not included.
- **Discord Rich Presence** — showing the book you're reading on your Discord
  profile is a desktop-only feature and is not included.

## Build

Requires [Node.js](https://nodejs.org).

```bash
yarn            # install dependencies
yarn dev        # run a dev server at http://localhost:5173
yarn build      # produce a static site in dist/
```

## Using the build

`yarn build` outputs a plain static site to `dist/`, serve that folder with any static web server. Or quick local preview of the built site:

```bash
yarn preview    # serves dist/ at http://localhost:4173
```

To deploy, copy `dist/` to any static host (Nginx, Apache, GitHub Pages,
Netlify, Vercel, Cloudflare Pages, an S3 bucket, …). No backend is required.

## Embedding a single book (optional)

Aozora Web can also drop into a host site as a single-book reader. Open a page
with a `?book=` query parameter and it loads that book straight into the reader,
skipping the library:

- `?book=<absolute-url>`, fetches the EPUB from that URL directly.
- `?book=<name>`, resolves to `<VITE_BOOKSHELF_BASE>/<name>.epub`. By default
  this is a plain static fetch — just put your `.epub` files in that folder on
  the same web server, no backend required.

`VITE_BOOKSHELF_BASE` is baked in at build time (set it in a `.env` file before
`yarn build`; the default is `/uploads/ebooks`):

```
VITE_BOOKSHELF_BASE=/uploads/ebooks   # ?book=<name> → <base>/<name>.epub
```

### Where the `.epub` files go

The default `/uploads/ebooks` is an **absolute** path, so it always resolves
against the **root of the origin serving the page** — not next to `dist/`. In
other words `?book=1234` fetches `https://<your-site>/uploads/ebooks/1234.epub`.

So the folder must sit at the served web root. When you serve `dist/` directly
(e.g. `yarn preview`, or copying `dist/` to a static host), put the books
**inside** `dist`:

```
dist/
├── index.html
├── assets/
└── uploads/ebooks/
    └── 1234.epub          # ← ?book=1234
```

If your books live elsewhere (a separate storage dir, another server), point
your web server so the URL path `/uploads/ebooks/` maps to that directory
instead — there's no need to copy them into `dist`.

> Prefer a path relative to wherever the app is deployed? Set
> `VITE_BOOKSHELF_BASE=./uploads/ebooks` and rebuild; then an app served at
> `/reader/` looks for `/reader/uploads/ebooks/<name>.epub`.

Serving still needs a secure context (HTTPS or `localhost`) for WebCrypto and
IndexedDB, and cross-origin book URLs need CORS on the file host.

### Token-gated, encrypted serving (optional)

> This mode exists because of how I run Aozora Web on my own project — the
> reader is embedded in a site that gates book access behind a backend. It's
> **off by default** and most deployments never need it: the plain static
> serving above is the normal path. If you don't run a matching token backend,
> just ignore this section.

For access-controlled hosting, build with `VITE_REQUIRE_TOKEN=true`. The reader
then requests a short-lived token/key from a backend before loading each named
book, and decrypts the EPUB (AES-256-GCM) in memory — so the host can gate
access and never serve a plain `.epub`:

```
VITE_REQUIRE_TOKEN=true
VITE_API_BASE=/api                    # token endpoint: <base>/reader/token
```

Like `VITE_BOOKSHELF_BASE`, the default `/api` is a relative path — it resolves
against the root of whatever origin serves the page, so it's not tied to any
particular host. Point it elsewhere (e.g. `https://api.example.com`) if your
token backend lives on another origin.

This requires a backend that implements `GET <VITE_API_BASE>/reader/token?book=<name>`
returning `{ token, key }`; absolute-URL books skip it and stay plaintext.
