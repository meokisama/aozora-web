/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the host serves epubs; `?book=<name>` → `<base>/<name>.epub`. */
  readonly VITE_BOOKSHELF_BASE?: string;
  /** API base for the access-token endpoint (`<base>/reader/token`). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
