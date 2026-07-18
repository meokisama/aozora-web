/**
 * Annotations store — the IndexedDB replacement for the desktop app's SQLite
 * `annotations` table + `library:*-annotation` IPC. Exposes the same method names
 * the reader's `use-annotations` hook calls (`listAnnotations` / `addAnnotation` /
 * `updateAnnotation` / `removeAnnotation`); id + createdAt are generated here as
 * the main process did, and `updateAnnotation` writes only the provided fields.
 */

import type { Annotation, AddAnnotationPayload, UpdateAnnotationPayload } from "@/lib/types";
import { idbGetAllByIndex, idbGetRecord, idbPutRecord, idbDelete, STORE_ANNOTATIONS } from "./db";

/** A book's highlights, in reading order (then creation), matching the original
 *  `ORDER BY start_char ASC, created_at ASC`. */
export async function listAnnotations(bookId: string): Promise<Annotation[]> {
  const rows = await idbGetAllByIndex<Annotation>(STORE_ANNOTATIONS, "bookId", bookId);
  return rows.sort((a, b) => a.startChar - b.startChar || a.createdAt - b.createdAt);
}

export async function addAnnotation({ bookId, startChar, endChar, color, note, snippet, progress }: AddAnnotationPayload): Promise<Annotation> {
  const rec: Annotation = {
    id: crypto.randomUUID(),
    bookId,
    startChar,
    endChar,
    color,
    note: note ?? null,
    snippet: snippet ?? null,
    progress,
    createdAt: Date.now(),
  };
  await idbPutRecord(STORE_ANNOTATIONS, rec);
  return rec;
}

/** Updates an annotation's colour and/or note; only provided fields are written. */
export async function updateAnnotation({ id, color, note }: UpdateAnnotationPayload): Promise<Annotation | null> {
  const rec = await idbGetRecord<Annotation>(STORE_ANNOTATIONS, id);
  if (!rec) return null;
  if (color !== undefined) rec.color = color;
  if (note !== undefined) rec.note = note;
  await idbPutRecord(STORE_ANNOTATIONS, rec);
  return rec;
}

export async function removeAnnotation(id: string): Promise<void> {
  await idbDelete(STORE_ANNOTATIONS, id);
}
