/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the host serves epubs; `?book=<name>` → `<base>/<name>.epub`. */
  readonly VITE_BOOKSHELF_BASE?: string;
  /** API base for the access-token endpoint (`<base>/reader/token`). */
  readonly VITE_API_BASE?: string;
  /**
   * `"true"` → token-gated, encrypted serving (fetch key from `/reader/token`).
   * Otherwise → plain static `<VITE_BOOKSHELF_BASE>/<name>.epub`, no backend.
   */
  readonly VITE_REQUIRE_TOKEN?: string;
  /** GA4 measurement id (`G-XXXXXXX`). Unset → analytics disabled. */
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
