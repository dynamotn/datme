/**
 * Counterpart of src/lib/encrypt.ts. A payload is base64(salt | iv | data), its
 * AES key derived from the password and the salt by PBKDF2-SHA256. The key can
 * be kept apart from the password: it opens that payload, and nothing else.
 */
const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/** The salt of a payload, in base64: two payloads share a key only when they share it. */
export const saltOf = (payload: string) => base64(bytesOf(payload).slice(0, 16))

/** A password as a key that derives others, and that cannot be read back. */
export const passwordKey = (password: string) => crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])

/** The AES key of a payload, as base64 of its bytes; null when the payload or the count is damaged. */
export async function payloadKey(payload: string, password: CryptoKey, iterations: number): Promise<string | null> {
  try {
    const salt = bytesOf(payload).slice(0, 16)
    return base64(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, password, 256)))
  } catch {
    return null
  }
}

/** Decrypt a payload with its AES key (base64); null when the key does not fit or the payload is damaged. */
export async function decryptWith(payload: string, key: string): Promise<string | null> {
  try {
    const bytes = bytesOf(payload)
    const aes = await crypto.subtle.importKey("raw", bytesOf(key), "AES-GCM", false, ["decrypt"])
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(16, 28) }, aes, bytes.slice(28)))
  } catch {
    return null
  }
}

/** Decrypt a payload with its password; null when the password is wrong or the payload damaged. */
export async function decrypt(payload: string, password: string, iterations: number): Promise<string | null> {
  const key = await payloadKey(payload, await passwordKey(password), iterations)
  return key == null ? null : decryptWith(payload, key)
}
