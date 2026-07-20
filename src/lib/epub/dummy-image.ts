/**
 * 1x1 transparent GIF data-URI carrying the original image path in an `aoz:<key>`
 * segment. Swapped in during flattening, back to object URLs at render (format-html),
 * keeping the flattened HTML a plain serializable string with no live blob refs.
 */
export function buildDummyImage(key: string): string {
  return `data:image/gif;aoz:${key};base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==`;
}
