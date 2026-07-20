import type { Section } from "@/lib/epub/generate-html";

/** Index of the last chapter starting at or before `char`, or -1 if none. */
export function chapterIndexAt(chapters: Section[], char: number): number {
  let idx = -1;
  for (let i = 0; i < chapters.length; i++) {
    if ((chapters[i].startCharacter ?? 0) <= char) idx = i;
    else break;
  }
  return idx;
}
