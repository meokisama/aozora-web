/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the host serves epubs; `?book=<name>` → `<base>/<name>.epub`. */
  readonly VITE_BOOKSHELF_BASE?: string;
  /** API base for the access-token endpoint (`<base>/reader/token`). */
  readonly VITE_API_BASE?: string;
  /** GA4 measurement id (`G-XXXXXXX`). Unset → analytics disabled. */
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  dataLayer: unknown[];
}
