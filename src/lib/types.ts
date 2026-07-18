/** The book shape the reader consumes. `WebBook` (platform/types) extends it. */
export interface Book {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  filePath: string;
  coverPath: string | null;
  fileSize: number | null;
  addedAt: number;
  lastOpenedAt: number | null;
  progress: number;
  exploredCharCount: number;
  charCount: number;
  favorite: boolean;
  coverDataUrl?: string | null;
}

export interface Bookmark {
  id: string;
  bookId: string;
  charOffset: number;
  progress: number;
  snippet: string | null;
  createdAt: number;
}

/**
 * A highlighted (and optionally annotated) span of a book. Anchored by the same
 * character-offset model as reading position/bookmarks — `startChar`/`endChar`
 * survive re-flow and mode switches, so the wash is re-painted from them (via the
 * CSS Custom Highlight API) rather than stored as fragile DOM ranges. `color` is
 * one of the reader's palette keys (see `lib/reader/annotations`); `snippet` is
 * the selected text kept for the management list; `note` is the user's comment.
 */
export interface Annotation {
  id: string;
  bookId: string;
  startChar: number;
  endChar: number;
  color: string;
  note: string | null;
  snippet: string | null;
  progress: number;
  createdAt: number;
}

export interface AddBookmarkPayload {
  bookId: string;
  charOffset: number;
  progress: number;
  snippet?: string;
}

export interface AddAnnotationPayload {
  bookId: string;
  startChar: number;
  endChar: number;
  color: string;
  note?: string;
  snippet?: string;
  progress: number;
}

/** Partial annotation update; only provided fields are persisted. */
export interface UpdateAnnotationPayload {
  id: string;
  color?: string;
  note?: string | null;
}
