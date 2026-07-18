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

1. If `<name>` is an absolute URL → fetch it directly (plaintext, no token/key).
2. Otherwise request `GET <API_BASE>/reader/token?book=<name>` → `{ token, key }`,
   then fetch `<BOOKSHELF_BASE>/<name>.epub` with header `X-Reader-Token`. The
   host serves it AES-256-GCM encrypted; the reader decrypts it in memory with
   `key` (WebCrypto) so the bytes on the wire aren't a usable `.epub`.
3. Parse + render (text or fixed-layout), restoring saved progress from IndexedDB.

The `.epub` is fetched (and decrypted) in-memory; reading progress is stored per
book id in IndexedDB. WebCrypto needs a secure context (HTTPS or localhost).

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
