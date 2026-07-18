import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { ReaderView } from "@/features/reader/reader-view";
import { LibraryView } from "@/features/library/library-view";
import { StatsView } from "@/features/stats/stats-view";
import { useReaderStore } from "@/stores/reader-store";
import { useUiStore } from "@/stores/ui-store";
import { useSettingsStore, THEMES } from "@/stores/settings-store";
import { useFontsStore } from "@/stores/fonts-store";
import { useLibraryStore } from "@/stores/library-store";
import { initFullscreenSync } from "@/platform/fullscreen";
import { openHostByName } from "@/platform/open-book";

/**
 * App shell. When launched with `?book=<name>` (the ranobe-hub embed entry) it
 * opens that host book straight into the reader; otherwise it shows the local
 * Library / Stats pages. The reader's Back button clears the current book, which
 * returns here — always to the Library (per the chosen navigation).
 */
export function App() {
  const currentBook = useReaderStore((s) => s.currentBook);
  const view = useUiStore((s) => s.view);
  const theme = useSettingsStore((s) => s.theme);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    useFontsStore.getState().init();
  }, []);
  useEffect(() => initFullscreenSync(), []);
  useEffect(() => {
    const isDark = (THEMES[theme] || THEMES.sepia).dark;
    document.documentElement.classList.toggle("dark", isDark);
  }, [theme]);

  // Load the library list up front so returning from the reader is instant.
  useEffect(() => {
    void useLibraryStore.getState().loadBooks();
  }, []);

  // Boot: a `?book=` param opens that host book directly; otherwise land on the
  // library. Refresh the library whenever the reader closes so progress shows.
  useEffect(() => {
    let cancelled = false;
    const name = new URLSearchParams(window.location.search).get("book");
    if (!name) {
      setBooting(false);
      return;
    }
    (async () => {
      try {
        const webBook = await openHostByName(name);
        if (cancelled) return;
        useReaderStore.getState().open(webBook);
      } catch (err) {
        console.error("Failed to open book", err);
        if (!cancelled) setError("Could not open this book.");
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the library grid fresh (progress/last-opened) each time a book closes.
  useEffect(() => {
    if (!currentBook) void useLibraryStore.getState().loadBooks();
  }, [currentBook]);

  if (currentBook) {
    return (
      <div className="h-screen">
        <ReaderView />
        <Toaster />
      </div>
    );
  }

  if (booting) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen">
      {error && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">{error}</div>
      )}
      {view === "stats" ? <StatsView /> : <LibraryView />}
      <Toaster />
    </div>
  );
}
