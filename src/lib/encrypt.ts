/**
 * Build-time encryption of protected notes: AES-256-GCM with a key derived
 * from the password by PBKDF2-SHA256. The payload is base64(salt | iv | data),
 * decrypted in the browser by src/scripts/decrypt.ts.
 */
const enc = new TextEncoder()

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")

export async function encrypt(plaintext: string, password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  )
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext)))
  const out = new Uint8Array(salt.length + iv.length + data.length)
  out.set(salt)
  out.set(iv, salt.length)
  out.set(data, salt.length + iv.length)
  return toBase64(out)
}
