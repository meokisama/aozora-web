/**
 * Where a library book's bytes come from:
 * - `host`: served by the ranobe-hub host, fetched over HTTP via `?book=` +
 *   token (only metadata + progress are stored locally, never the epub).
 * - `local`: imported from the user's machine; the epub blob lives in IndexedDB.
 */
export type BookSource = "host" | "local";

/** The book shape the reader consumes. `WebBook` (platform/types) extends it. */
export interface Book {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  /** For host books, the `?book=` name/URL; for local books, unused (""). */
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
  /** Defaults to "host" for records written before the field existed. */
  source?: BookSource;
}

export interface UpdateBookPayload {
  id: string;
  title?: string;
  author?: string;
  coverDataUrl?: string | null;
}

/** Partial reading-progress update; only provided fields are persisted. */
export interface ProgressUpdate {
  progress?: number;
  exploredCharCount?: number;
  charCount?: number;
  lastOpenedAt?: number;
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

// --- Reading stats. ---------------------------------------------------------

/** One completed reading session, recorded by the reader. */
export interface ReadingSession {
  bookId: string | null;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  charsRead: number;
}

export interface StatsOverview {
  totalChars: number;
  totalMs: number;
  sessionCount: number;
  activeDays: number;
  firstAt: number | null;
}

export interface DailyActivity {
  day: string; // 'YYYY-MM-DD', local calendar day
  chars: number;
  ms: number;
  sessions: number;
  books: number;
}

export interface HourlyActivity {
  hour: number; // 0–23, local hour-of-day
  chars: number;
  ms: number;
}

export interface PerBookStats {
  bookId: string;
  title: string | null;
  author: string | null;
  chars: number;
  ms: number;
  sessions: number;
  lastAt: number;
}

export interface Stats {
  overview: StatsOverview;
  daily: DailyActivity[];
  hourly: HourlyActivity[];
  perBook: PerBookStats[];
}
