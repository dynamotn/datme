/** Counterpart of src/lib/encrypt.ts; returns null when the password is wrong. */
export async function decrypt(payload: string, password: string, iterations: number): Promise<string | null> {
  const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
  const salt = bytes.slice(0, 16)
  const iv = bytes.slice(16, 28)
  const data = bytes.slice(28)
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  )
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data))
  } catch {
    return null
  }
}
