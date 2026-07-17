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
