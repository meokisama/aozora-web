/**
 * Per-book reading state (position + last-opened), stored in IndexedDB and keyed
 * by book id, so a reopened book resumes where it left off.
 */

import { idbGet, idbPut, STORE_PROGRESS } from "./db";

export interface ProgressRecord {
  id: string;
  progress: number;
  exploredCharCount: number;
  charCount: number;
  lastOpenedAt: number | null;
}

const EMPTY: Omit<ProgressRecord, "id"> = {
  progress: 0,
  exploredCharCount: 0,
  charCount: 0,
  lastOpenedAt: null,
};

export async function getProgress(id: string): Promise<ProgressRecord> {
  const rec = await idbGet<ProgressRecord>(STORE_PROGRESS, id);
  return rec ?? { id, ...EMPTY };
}

/** Merges partial fields into a book's record and persists it. */
export async function saveProgress(id: string, fields: Partial<Omit<ProgressRecord, "id">>): Promise<ProgressRecord> {
  const current = await getProgress(id);
  const next: ProgressRecord = { ...current, ...fields, id };
  await idbPut(STORE_PROGRESS, id, next);
  return next;
}
