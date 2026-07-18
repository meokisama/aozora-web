/**
 * Browser-side cover downscaling — the web equivalent of the desktop app's
 * main-process `resizeCover` (which used a native image lib). Covers embedded in
 * EPUBs vary wildly in size; a huge one wastes IndexedDB space and a tiny one
 * looks soft when the grid scales it up. We normalise them onto a canvas at a
 * capped width and re-encode as JPEG.
 *
 * Width is stored at ~2× the on-screen cover slot (~200px) so it stays crisp on
 * high-DPI screens instead of pixelating. Never upscales past the source.
 */

export const COVER_MAX_WIDTH = 300;
const COVER_JPEG_QUALITY = 0.85;

/** Encodes raw image bytes as a data: URL without re-sampling (the fallback when
 *  canvas decoding isn't available). */
function rawDataUrl(bytes: ArrayBuffer, mime: string | null): string {
  let binary = "";
  const chunk = 0x8000;
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += chunk) binary += String.fromCharCode(...arr.subarray(i, i + chunk));
  return `data:${mime || "image/jpeg"};base64,${btoa(binary)}`;
}

/**
 * Downscales cover bytes to at most `maxWidth` px wide and returns a JPEG data
 * URL. Falls back to the raw bytes (as a data URL) if the image can't be decoded
 * or drawn (e.g. no canvas/createImageBitmap). Returns null for empty input.
 */
export async function resizeCoverToDataUrl(
  bytes: ArrayBuffer | null | undefined,
  mime: string | null,
  maxWidth = COVER_MAX_WIDTH,
): Promise<string | null> {
  if (!bytes || bytes.byteLength === 0) return null;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime || "image/jpeg" }));
    const scale = Math.min(1, maxWidth / bitmap.width); // never upscale
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return rawDataUrl(bytes, mime);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", COVER_JPEG_QUALITY);
  } catch {
    return rawDataUrl(bytes, mime);
  }
}
