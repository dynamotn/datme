/**
 * Protected notes and locked parts: each `form.locked` holds a ciphertext,
 * decrypted in the browser into the element right after it. A password that
 * opens one part is tried on the others, on this page and on the next ones,
 * for as long as the tab keeps the site open. It is kept only as a key that
 * cannot be read back, in memory. What survives a reload, in sessionStorage,
 * is the AES key of each part opened on the page: it opens that part again,
 * and tells nothing of the password.
 */
import { decryptWith, passwordKey, payloadKey, saltOf } from "./decrypt"

const KEYS = "datme:keys:"
/** Older versions kept the passwords themselves here. */
const PASSWORDS = "datme:pw:"

/** The passwords that worked since the site was opened in this tab. */
let passwords: CryptoKey[] = []

/** Remove what sessionStorage holds under these prefixes. */
function drop(...prefixes: string[]) {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)!
      if (prefixes.some((p) => key.startsWith(p))) sessionStorage.removeItem(key)
    }
  } catch {
    // storage is blocked: nothing was kept
  }
}

/** Forget the passwords and keys of this tab, as closing it would; tests, which share one tab, start each case so. */
export function forgetPasswords() {
  passwords = []
  drop(KEYS, PASSWORDS)
}

/** The AES keys of the parts opened on this page, by the salt of each part. */
function savedKeys(): Record<string, string> {
  try {
    const keys = JSON.parse(sessionStorage.getItem(KEYS + location.pathname) ?? "{}")
    return keys && typeof keys === "object" && !Array.isArray(keys) ? keys : {}
  } catch {
    return {}
  }
}

function rememberKey(salt: string, key: string) {
  try {
    sessionStorage.setItem(KEYS + location.pathname, JSON.stringify({ ...savedKeys(), [salt]: key }))
  } catch {
    // the reader just types the password again next time
  }
}

/** The salt of a form's payload, or "" when the payload is damaged. */
function saltIn(form: HTMLFormElement): string {
  try {
    return saltOf(form.dataset.payload!)
  } catch {
    return ""
  }
}

/** Show a form's content, decrypted with an AES key; false when the key does not fit. */
async function reveal(form: HTMLFormElement, key: string): Promise<boolean> {
  const payload = form.dataset.payload!
  const html = await decryptWith(payload, key)
  if (html == null) return false
  rememberKey(saltOf(payload), key)
  if (!form.isConnected) return true
  const content = form.nextElementSibling as HTMLElement
  content.innerHTML = html
  content.hidden = false
  form.remove()
  return true
}

/** Open a form with the key kept for it, or else with one of these passwords; a form already gone counts as open. */
async function open(form: HTMLFormElement, tried: CryptoKey[]): Promise<boolean> {
  if (!form.isConnected) return true
  const payload = form.dataset.payload!
  const kept = savedKeys()[saltIn(form)]
  if (kept && (await reveal(form, kept))) return true
  for (const password of tried) {
    const key = await payloadKey(payload, password, Number(form.dataset.iterations))
    if (key != null && (await reveal(form, key))) return true
  }
  return false
}

/** Bind every locked form not bound yet; `revealed` runs after content appears, to set it up. */
export function setupLocked(revealed: () => void) {
  // Older versions kept the passwords themselves: they are dropped unread.
  drop(PASSWORDS)
  const forms = [...document.querySelectorAll<HTMLFormElement>("form.locked:not([data-bound])")]
  if (!forms.length) return
  // Open every form still locked that it can; whatever opens is set up, and may hold locked parts of its own.
  const tryAll = async (tried: CryptoKey[]) => {
    for (const form of document.querySelectorAll<HTMLFormElement>("form.locked")) await open(form, tried)
    revealed()
    setupLocked(revealed)
  }
  for (const form of forms) {
    form.dataset.bound = "1"
    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const input = form.querySelector("input")!
      const button = form.querySelector("button")!
      button.disabled = true
      const password = await passwordKey(input.value)
      const ok = await open(form, [password])
      button.disabled = false
      if (!ok) {
        form.querySelector<HTMLElement>(".locked-error")!.hidden = false
        input.select()
        return
      }
      input.value = ""
      passwords.push(password)
      await tryAll([password])
    })
  }
  // Parts opened before this reload open with their keys, and the passwords of this tab are tried on the rest.
  const kept = savedKeys()
  if (passwords.length || forms.some((f) => saltIn(f) in kept)) void tryAll(passwords)
}
