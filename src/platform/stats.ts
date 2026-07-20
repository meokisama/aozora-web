/**
 * Reading-stats store — IndexedDB replacement for the desktop app's SQLite stats.
 * Sessions are appended to `STORE_SESSIONS`; `getStats()` reads them all and
 * computes the aggregations in JS. Day/hour bucketing uses LOCAL calendar time.
 */

import { idbGetAll, idbPutRecord, STORE_SESSIONS } from "./db";
import { listBooks } from "./library";
import { toDayKey } from "@/lib/stats/aggregate";
import type { ReadingSession, StatsOverview, DailyActivity, HourlyActivity, PerBookStats, Stats } from "@/lib/types";

/** A stored reading session; `id` is its own key. */
interface StoredSession extends ReadingSession {
  id: string;
}

/** Records a completed session. Skips no-ops (open-and-close). Returns whether stored. */
export async function recordSession(session: ReadingSession): Promise<boolean> {
  const durationMs = Math.round(session?.durationMs ?? 0);
  const charsRead = Math.round(session?.charsRead ?? 0);
  if (durationMs < 1000 && charsRead <= 0) return false;
  await idbPutRecord(STORE_SESSIONS, {
    id: crypto.randomUUID(),
    bookId: session.bookId ?? null,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMs,
    charsRead,
  });
  return true;
}

/** Local hour-of-day (0–23) of an epoch-ms timestamp. */
function hourOf(ms: number): number {
  return new Date(ms).getHours();
}

/** All-time totals: chars, ms, session count, distinct active days, first session (null if none). */
function computeOverview(sessions: StoredSession[]): StatsOverview {
  let totalChars = 0;
  let totalMs = 0;
  let firstAt: number | null = null;
  const days = new Set<string>();
  for (const s of sessions) {
    totalChars += s.charsRead || 0;
    totalMs += s.durationMs || 0;
    days.add(toDayKey(new Date(s.startedAt)));
    if (firstAt === null || s.startedAt < firstAt) firstAt = s.startedAt;
  }
  return { totalChars, totalMs, sessionCount: sessions.length, activeDays: days.size, firstAt };
}

/** Per-day activity by local day, oldest-first: chars, ms, sessions, distinct books (null ids ignored). */
function computeDaily(sessions: StoredSession[]): DailyActivity[] {
  const map = new Map<string, { chars: number; ms: number; sessions: number; books: Set<string> }>();
  for (const s of sessions) {
    const day = toDayKey(new Date(s.startedAt));
    let bucket = map.get(day);
    if (!bucket) {
      bucket = { chars: 0, ms: 0, sessions: 0, books: new Set() };
      map.set(day, bucket);
    }
    bucket.chars += s.charsRead || 0;
    bucket.ms += s.durationMs || 0;
    bucket.sessions += 1;
    if (s.bookId != null) bucket.books.add(s.bookId);
  }
  return [...map.entries()]
    .map(([day, b]) => ({ day, chars: b.chars, ms: b.ms, sessions: b.sessions, books: b.books.size }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Activity by local hour-of-day, ordered by hour. Only hours that occur are returned. */
function computeHourly(sessions: StoredSession[]): HourlyActivity[] {
  const map = new Map<number, { chars: number; ms: number }>();
  for (const s of sessions) {
    const hour = hourOf(s.startedAt);
    let bucket = map.get(hour);
    if (!bucket) {
      bucket = { chars: 0, ms: 0 };
      map.set(hour, bucket);
    }
    bucket.chars += s.charsRead || 0;
    bucket.ms += s.durationMs || 0;
  }
  return [...map.entries()].map(([hour, b]) => ({ hour, chars: b.chars, ms: b.ms })).sort((a, b) => a.hour - b.hour);
}

/**
 * Per-book totals (non-null book id), joined to current library title/author,
 * ordered by time read desc. Books no longer in the library are dropped.
 */
async function computePerBook(sessions: StoredSession[]): Promise<PerBookStats[]> {
  const map = new Map<string, { chars: number; ms: number; sessions: number; lastAt: number }>();
  for (const s of sessions) {
    if (s.bookId == null) continue;
    let bucket = map.get(s.bookId);
    if (!bucket) {
      bucket = { chars: 0, ms: 0, sessions: 0, lastAt: 0 };
      map.set(s.bookId, bucket);
    }
    bucket.chars += s.charsRead || 0;
    bucket.ms += s.durationMs || 0;
    bucket.sessions += 1;
    if (s.endedAt > bucket.lastAt) bucket.lastAt = s.endedAt;
  }

  const books = await listBooks();
  const byId = new Map(books.map((b) => [b.id, b]));

  const result: PerBookStats[] = [];
  for (const [bookId, b] of map) {
    const book = byId.get(bookId);
    if (!book) continue; // removed from library — drop
    result.push({ bookId, title: book.title, author: book.author, chars: b.chars, ms: b.ms, sessions: b.sessions, lastAt: b.lastAt });
  }
  return result.sort((a, b) => b.ms - a.ms);
}

/** One round-trip for the stats page: overview, per-day, per-hour, per-book totals. */
export async function getStats(): Promise<Stats> {
  const sessions = await idbGetAll<StoredSession>(STORE_SESSIONS);
  return {
    overview: computeOverview(sessions),
    daily: computeDaily(sessions),
    hourly: computeHourly(sessions),
    perBook: await computePerBook(sessions),
  };
}
