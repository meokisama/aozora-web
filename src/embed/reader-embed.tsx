import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { ReaderView } from "@/features/reader/reader-view";
import { useReaderStore } from "@/stores/reader-store";
import { useSettingsStore, THEMES } from "@/stores/settings-store";
import { useFontsStore } from "@/stores/fonts-store";
import { initFullscreenSync } from "@/platform/fullscreen";
import { getProgress } from "@/platform/progress";
import type { WebBook } from "@/platform/types";

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/+$/, "");
const BOOKSHELF_BASE = (import.meta.env.VITE_BOOKSHELF_BASE || "/uploads/ebooks").replace(/\/+$/, "");

const isAbsolute = (s: string) => /^https?:\/\//i.test(s);

/** Resolves the `?book=` param to an epub URL. Absolute URLs pass through;
 *  a bare name maps into the host bookshelf with a `.epub` extension. */
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

/**
 * Standalone/embed reader: opens a single book named by `?book=` (a bookshelf
 * filename or an absolute URL) instead of the library. Fetches a host token,
 * restores saved progress, and hands the book to the shared <ReaderView>. Built
 * with `--mode embed` to replace a host's bundled reader (e.g. at `/reader`).
 */
export function ReaderEmbed() {
  const currentBook = useReaderStore((s) => s.currentBook);
  const theme = useSettingsStore((s) => s.theme);
  const [error, setError] = useState<string | null>(null);
  const [openedOnce, setOpenedOnce] = useState(false);

  useEffect(() => {
    useFontsStore.getState().init();
  }, []);
  useEffect(() => initFullscreenSync(), []);
  useEffect(() => {
    const isDark = (THEMES[theme] || THEMES.sepia).dark;
    document.documentElement.classList.toggle("dark", isDark);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const book = new URLSearchParams(window.location.search).get("book");
      if (!book) {
        setError("No book specified.");
        return;
      }
      try {
        const { token, key } = await fetchToken(book);
        if (cancelled) return;
        const id = `embed:${book}`;
        const p = await getProgress(id);
        if (cancelled) return;
        const webBook: WebBook = {
          id,
          title: book.replace(/^.*\//, "").replace(/\.epub$/i, ""),
          author: null,
          language: null,
          filePath: book,
          coverPath: null,
          fileSize: null,
          addedAt: 0,
          lastOpenedAt: p.lastOpenedAt,
          progress: p.progress,
          exploredCharCount: p.exploredCharCount,
          charCount: p.charCount,
          favorite: false,
          coverDataUrl: null,
          url: resolveEpubUrl(book),
          token,
          key,
        };
        useReaderStore.getState().open(webBook);
      } catch (err) {
        console.error("Failed to open book", err);
        if (!cancelled) setError("Could not open this book.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentBook) setOpenedOnce(true);
  }, [currentBook]);

  // The reader's back button clears the current book; in embed there's no
  // library to return to, so leave the reader (back to the referring page, or
  // close the tab) once a book had actually been opened.
  useEffect(() => {
    if (error || currentBook || !openedOnce) return;
    if (document.referrer) window.location.href = document.referrer;
    else window.close();
  }, [currentBook, error, openedOnce]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!currentBook) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-screen">
      <ReaderView />
      <Toaster />
    </div>
  );
}
