/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the host serves epubs; `?book=<name>` → `<base>/<name>.epub`. */
  readonly VITE_BOOKSHELF_BASE?: string;
  /** API base for the access-token endpoint (`<base>/reader/token`). */
  readonly VITE_API_BASE?: string;
  /**
   * `"true"` → `?book=<name>` fetches a token/key from `<VITE_API_BASE>/reader/token`
   * before loading (token-gated, encrypted serving; the ranobe-hub setup).
   * Unset/anything else → names are served as plain static files straight from
   * `<VITE_BOOKSHELF_BASE>/<name>.epub`, no backend needed (bibi-style).
   */
  readonly VITE_REQUIRE_TOKEN?: string;
  /** GA4 measurement id (`G-XXXXXXX`). Unset → analytics disabled. */
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  dataLayer: unknown[];
}
