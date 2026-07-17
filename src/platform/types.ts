import type { Book } from "@/lib/types";

/**
 * A book opened by the embed reader. Extends the shared `Book` shape (so the
 * reader consumes it unchanged) with the plaintext `.epub` URL to fetch and an
 * optional bearer token sent as `X-Reader-Token`. `filePath`/`coverPath` from
 * the desktop `Book` are unused here.
 */
export interface WebBook extends Book {
  /** The `.epub` URL to fetch. */
  url: string;
  /** Optional bearer token sent as the `X-Reader-Token` header. */
  token?: string;
}
