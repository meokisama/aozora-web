/**
 * Resolves a book (a `?book=` host name or a stored library record) into a
 * `WebBook` the reader can open: for host books it resolves the epub URL and
 * fetches a fresh short-lived token/key; for local books it just marks the
 * source (the reader reads the blob from IndexedDB). Host books are auto-added
 * to the library on open (see `upsertHostBook`).
 */

import * as library from "./library";
import { useSettingsStore } from "@/stores/settings-store";
import type { WebBook } from "./types";
import type { Book } from "@/lib/types";

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/+$/, "");
const BOOKSHELF_BASE = (import.meta.env.VITE_BOOKSHELF_BASE || "/uploads/ebooks").replace(/\/+$/, "");

const isAbsolute = (s: string) => /^https?:\/\//i.test(s);

/** Hako (Vietnamese light-novel) epubs are embedded by absolute URL under a
 *  `/hako/` path. They get their own reader settings profile (see settings-store). */
const isHako = (nameOrUrl: string) => /\/hako\//i.test(nameOrUrl);

/** Activates the reader settings profile a book should open with, so the reader
 *  reads the right prefs before it mounts. */
function activateProfileFor(nameOrUrl: string): void {
  useSettingsStore.getState().setActiveProfile(isHako(nameOrUrl) ? "hako" : "default");
}

/** Resolves the `?book=` param to an epub URL. Absolute URLs pass through; a bare
 *  name maps into the host bookshelf with a `.epub` extension. */
function resolveEpubUrl(book: string): string {
  if (isAbsolute(book)) return book;
  const name = /\.epub$/i.test(book) ? book : `${book}.epub`;
  return `${BOOKSHELF_BASE}/${name}`;
}

/** Requests a short-lived access token + decryption key for a host-served book
 *  (skipped for absolute external URLs, which the host doesn't gate/encrypt). */
async function fetchToken(book: string): Promise<{ token?: string; key?: string }> {
  if (isAbsolute(book)) return {};
  const res = await fetch(`${API_BASE}/reader/token?book=${encodeURIComponent(book)}`);
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = (await res.json()) as { token?: string; key?: string };
  if (!data.token) throw new Error("no token");
  return { token: data.token, key: data.key };
}

/** Opens a host book by its `?book=` name: fetches a token, auto-adds/refreshes
 *  its library record, and returns the WebBook (progress restored from the record). */
export async function openHostByName(name: string): Promise<WebBook> {
  activateProfileFor(name);
  const { token, key } = await fetchToken(name);
  const rec = await library.upsertHostBook({ name });
  return { ...rec, source: "host", url: resolveEpubUrl(name), token, key };
}

/** Opens a stored library record (from the grid). Local books read from IndexedDB;
 *  host books re-resolve their URL + fetch a fresh token. */
export async function openLibraryBook(book: Book): Promise<WebBook> {
  activateProfileFor(book.filePath);
  if (book.source === "local") return { ...book, source: "local", url: "" };
  const name = book.filePath; // host records keep the `?book=` name here
  const { token, key } = await fetchToken(name);
  return { ...book, source: "host", url: resolveEpubUrl(name), token, key };
}
