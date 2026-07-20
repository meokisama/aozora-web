import type { Book } from "@/lib/types";

/** A book opened by the embed reader — the shared `Book` plus fetch URL and optional token/key. */
export interface WebBook extends Book {
  /** The `.epub` URL to fetch. */
  url: string;
  /** Optional bearer token sent as the `X-Reader-Token` header. */
  token?: string;
  /** Base64 AES-256-GCM key for host-served epubs; absent for plaintext external URLs. */
  key?: string;
}
