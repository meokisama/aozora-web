# Aozora Web (embed reader)

A single-book EPUB reader for the browser — a trimmed port of the
[Aozora](https://github.com/meokisama/aozora) desktop reader, kept to just the
reading experience (reflowable text + fixed-layout/manga). No dictionary, TTS,
Anki, Discord, stats, or library.

It opens **one book named by a `?book=` query param** and is meant to drop into a
host that serves epubs — e.g. replacing a bundled bibi reader. See
[RANOBE.md](RANOBE.md) for the ranobe-hub integration.

## How it works

Opening `/<page>?book=<name>`:

1. If `<name>` is an absolute URL → fetch it directly.
2. Otherwise request a short-lived token `GET <API_BASE>/reader/token?book=<name>`,
   then fetch `<BOOKSHELF_BASE>/<name>.epub` with header `X-Reader-Token`.
3. Parse + render (text or fixed-layout), restoring saved progress from IndexedDB.

The raw `.epub` is fetched in-memory; reading progress is stored per book id in
IndexedDB.

## Config (build-time)

Baked from env vars (defaults match ranobe-hub); override via a `.env` before build:

```
VITE_BOOKSHELF_BASE=/uploads/ebooks   # ?book=<name> → <base>/<name>.epub
VITE_API_BASE=/api                    # token endpoint: <base>/reader/token
```

## Develop / build

```
yarn
yarn dev                # http://localhost:5173/?book=<name>
yarn build              # → dist/  (static)
```

Serve `dist/` over HTTP (it must run behind the host that serves the epubs +
token endpoint; `file://` won't work). HTTPS or localhost is required for
`crypto`/IndexedDB.
