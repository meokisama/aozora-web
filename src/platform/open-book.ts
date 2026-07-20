/**
 * Resolves a `?book=` host name or a library record into a `WebBook` for the
 * reader: host books get a URL + fresh token/key; local books just mark the
 * source. Host books are auto-added to the library on open.
 */

import * as library from "./library";
import { useSettingsStore } from "@/stores/settings-store";
import type { WebBook } from "./types";
import type { Book } from "@/lib/types";

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/+$/, "");
const BOOKSHELF_BASE = (import.meta.env.VITE_BOOKSHELF_BASE || "/uploads/ebooks").replace(/\/+$/, "");

/** When set, `?book=` fetches a token/key first (encrypted serving); off = plain static files. */
const REQUIRE_TOKEN = import.meta.env.VITE_REQUIRE_TOKEN === "true";

const isAbsolute = (s: string) => /^https?:\/\//i.test(s);

/** Hako (Vietnamese light-novel) epubs live under `/hako/` and get their own settings profile. */
const isHako = (nameOrUrl: string) => /\/hako\//i.test(nameOrUrl);

/** Activates the settings profile a book should open with, before the reader mounts. */
function activateProfileFor(nameOrUrl: string): void {
  useSettingsStore.getState().setActiveProfile(isHako(nameOrUrl) ? "hako" : "default");
}

/** Resolves `?book=` to an epub URL; absolute URLs pass through, bare names map into the bookshelf. */
function resolveEpubUrl(book: string): string {
  if (isAbsolute(book)) return book;
  const name = /\.epub$/i.test(book) ? book : `${book}.epub`;
  return `${BOOKSHELF_BASE}/${name}`;
}

/** Requests a short-lived token + decryption key; skipped when gating is off or the URL is external. */
async function fetchToken(book: string): Promise<{ token?: string; key?: string }> {
  if (!REQUIRE_TOKEN || isAbsolute(book)) return {};
  const res = await fetch(`${API_BASE}/reader/token?book=${encodeURIComponent(book)}`);
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = (await res.json()) as { token?: string; key?: string };
  if (!data.token) throw new Error("no token");
  return { token: data.token, key: data.key };
}

/** Opens a host book by `?book=` name: fetches a token, upserts its record, returns the WebBook. */
export async function openHostByName(name: string): Promise<WebBook> {
  activateProfileFor(name);
  const { token, key } = await fetchToken(name);
  const rec = await library.upsertHostBook({ name });
  return { ...rec, source: "host", url: resolveEpubUrl(name), token, key };
}

/** Opens a stored library record; local books read from IndexedDB, host books re-resolve + re-token. */
export async function openLibraryBook(book: Book): Promise<WebBook> {
  activateProfileFor(book.filePath);
  if (book.source === "local") return { ...book, source: "local", url: "" };
  const name = book.filePath; // host records keep the `?book=` name here
  const { token, key } = await fetchToken(name);
  return { ...book, source: "host", url: resolveEpubUrl(name), token, key };
}
