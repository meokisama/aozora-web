# Embed reader for ranobe-hub (replacing bibi)

This whole app is a single-book reader driven by `?book=`, meant to drop into
ranobe-hub's backend at `/reader` in place of the vendored bibi.

It keeps the **exact same frontend contract** — `{API_URL}/reader?book=<filename
without .epub>` — so **no frontend changes are needed**. The backend gains
short-lived, per-book access tokens instead of the spoofable Referer check.

## How it works

1. Frontend links to `/reader?book=<name>` (unchanged).
2. The embed reader requests `GET /api/reader/token?book=<name>` (referer-gated).
3. It fetches `/uploads/ebooks/<name>.epub` with header `X-Reader-Token: <token>`.
4. The backend serves the epub only for a valid, non-expired token bound to that
   exact book. A leaked epub URL is useless after ~10 minutes.

## Backend changes (already applied in ranobe-hub)

- `backend/utils/readerToken.js` — signs/verifies book-bound JWTs (10-min TTL).
- `backend/server.js` — `GET /api/reader/token` (referer-gated, rate-limited);
  `/uploads/ebooks` now requires a valid `X-Reader-Token` (Referer check removed).

Uses the existing `JWT_SECRET`; no new env vars.

## Build & deploy the reader

```
# in aozora-web/
yarn build                # → dist/
```

Replace the backend's reader dir with the build output:

```
rm -rf   /path/to/ranobe-hub/backend/reader/*
cp -r    dist/*  /path/to/ranobe-hub/backend/reader/
```

Restart the backend. Reader is live at `{API_URL}/reader?book=…`.

### Paths / config

Defaults are baked at build time (see `.env` overrides) and already match
ranobe-hub:

```
VITE_BOOKSHELF_BASE=/uploads/ebooks   # ?book=<name> → <base>/<name>.epub
VITE_API_BASE=/api                    # token endpoint: <base>/reader/token
```

Change them and rebuild if your host differs. The reader **must** stay at
`/reader` (the token endpoint's referer gate expects it).

## Verify live

- Open `{API_URL}/reader?book=<a real filePath minus .epub>` → book renders.
- Network tab:
  - `GET /api/reader/token?book=…` → 200 `{token}`
  - `GET /uploads/ebooks/<name>.epub` (with `X-Reader-Token`) → 200
  - the same epub URL opened directly (no token) → 403

## Notes / optional improvements

- The header title shows the filename (e.g. a UUID). To show the real title,
  pass `&title=` from the frontend and read it in `reader-embed.tsx` (small
  frontend change — omitted to keep the drop-in contract).
