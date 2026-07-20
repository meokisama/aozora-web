/**
 * Where a book's bytes come from:
 * - `host`: fetched over HTTP via `?book=` + token; only metadata/progress stored locally.
 * - `local`: imported by the user; epub blob lives in IndexedDB.
 */
export type BookSource = "host" | "local";

/** Book shape the reader consumes; `WebBook` (platform/types) extends it. */
export interface Book {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  /** Host books: the `?book=` name/URL. Local books: unused (""). */
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
  /** Defaults to "host" for records predating this field. */
  source?: BookSource;
}

export interface UpdateBookPayload {
  id: string;
  title?: string;
  author?: string;
  coverDataUrl?: string | null;
}

/** Partial progress update; only provided fields are persisted. */
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
 * A highlighted (optionally annotated) span. Anchored by char offsets so it
 * survives re-flow/mode switches and is re-painted via the CSS Custom Highlight
 * API rather than stored as fragile DOM ranges. `color` is a reader palette key.
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

/** Partial annotation update; only provided fields persisted. */
export interface UpdateAnnotationPayload {
  id: string;
  color?: string;
  note?: string | null;
}

// --- Reading stats. ---------------------------------------------------------

/** One completed reading session. */
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
