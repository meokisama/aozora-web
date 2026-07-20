/**
 * Browser AES-256-GCM helpers (WebCrypto). Format: `iv(12) || ciphertext || tag(16)`
 * — same framing as the backend's served epubs. Keys are the base64 per-book key
 * from the host token endpoint. Requires a secure context (HTTPS/localhost).
 */

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypts `data`, returning `iv || ciphertext || tag`. */
export async function aesGcmEncrypt(keyB64: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data as BufferSource));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

/** Decrypts an `iv(12) || ciphertext || tag(16)` payload back to plaintext bytes. */
export async function aesGcmDecrypt(keyB64: string, payload: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await importKey(keyB64);
  const bytes = new Uint8Array(payload);
  const iv = bytes.subarray(0, 12);
  const body = bytes.subarray(12); // ciphertext || tag (WebCrypto expects tag appended)
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, body);
}
