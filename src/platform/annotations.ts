/** Annotations store (IndexedDB), replacing the desktop app's SQLite `annotations` table. */

import type { Annotation, AddAnnotationPayload, UpdateAnnotationPayload } from "@/lib/types";
import { idbGetAllByIndex, idbGetRecord, idbPutRecord, idbDelete, STORE_ANNOTATIONS } from "./db";

/** A book's highlights, ordered by start position then creation. */
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

/** Updates colour and/or note; only provided fields are written. */
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
