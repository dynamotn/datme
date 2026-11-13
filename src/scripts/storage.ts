/**
 * The reader's settings in the browser's storage. Storage can be blocked
 * (private mode, a strict browser): then nothing reads as saved, and a
 * setting lasts for the page only.
 */

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Save a setting, or forget it with null. */
export function writeItem(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // blocked: the setting lasts for this page only
  }
}
