import React from "react";
import { Button } from "@/components/ui/button";
import aozoraLogo from "@/assets/aozora-logo.png";

/** The original desktop Aozora project. */
const AOZORA_REPO = "https://github.com/meokisama/aozora";

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden {...props}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * About page: introduces the original desktop Aozora and makes clear this web app
 * is a trimmed "mini" edition built specifically for ranobe-hub.
 */
export function AboutView() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-12 text-center">
          <a href={AOZORA_REPO} target="_blank" rel="noopener noreferrer" title="View the original Aozora on GitHub">
            <img src={aozoraLogo} alt="Aozora" className="h-24 w-auto object-contain transition-opacity hover:opacity-80" draggable={false} />
          </a>

          <div className="space-y-3 text-sm/relaxed text-foreground/90">
            <p>
              <span className="font-semibold">Aozora</span> is a desktop EPUB reader for Japanese learners — full-text search, a Yomitan pop-up
              dictionary, Anki mining, VOICEVOX text-to-speech, reading statistics, and more, wrapped around a reflowable + manga reader.
            </p>
            <p className="rounded-md bg-muted/60 px-4 py-3 text-xs/relaxed text-muted-foreground">
              This site is a <span className="font-medium text-foreground">mini edition of Aozora built specifically for ranobe-hub</span>. It keeps
              only the reading experience — the reflowable/manga reader, your library, reading stats, bookmarks and highlights. The dictionary,
              text-to-speech, Anki, and Discord features of the desktop app are not included.
            </p>
            <p className="text-xs text-muted-foreground">
              All credit for Aozora goes to the original project. This is an unofficial web port for use inside ranobe-hub.
            </p>
          </div>

          <Button variant="outline" size="sm" asChild>
            <a href={AOZORA_REPO} target="_blank" rel="noopener noreferrer">
              <GithubIcon className="size-3.5" />
              View the original on GitHub
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
