/**
 * Protected notes and locked parts of notes: each `form.locked` holds a
 * ciphertext, decrypted in the browser into the element right after it. The
 * passwords that worked are remembered for the session, per page, and a
 * password that opens one part is tried on the others.
 */
import { decrypt } from "./decrypt"

const PW_KEY = "datme:pw:"

/** Passwords that opened something on this page; older versions stored a single one. */
function saved(): string[] {
  try {
    const raw = sessionStorage.getItem(PW_KEY + location.pathname)
    if (raw == null) return []
    try {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) return list.filter((p) => typeof p === "string")
    } catch {
      // a plain password
    }
    return [raw]
  } catch {
    return []
  }
}

function remember(password: string) {
  const list = saved()
  if (list.includes(password)) return
  try {
    sessionStorage.setItem(PW_KEY + location.pathname, JSON.stringify([...list, password]))
  } catch {
    // the reader just types it again next time
  }
}

async function open(form: HTMLFormElement, password: string): Promise<boolean> {
  if (!form.isConnected) return true
  const html = await decrypt(form.dataset.payload!, password, Number(form.dataset.iterations))
  if (html == null || !form.isConnected) return html != null
  const content = form.nextElementSibling as HTMLElement
  content.innerHTML = html
  content.hidden = false
  form.remove()
  return true
}

/** Bind every locked form not bound yet; `revealed` runs after content appears, to set it up. */
export function setupLocked(revealed: () => void) {
  const forms = [...document.querySelectorAll<HTMLFormElement>("form.locked:not([data-bound])")]
  if (!forms.length) return
  // Try passwords on every form still locked; whatever opens is set up, and may hold locked parts of its own.
  const tryAll = async (passwords: string[]) => {
    for (const form of document.querySelectorAll<HTMLFormElement>("form.locked")) {
      for (const pw of passwords) if (await open(form, pw)) break
    }
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
      const ok = await open(form, input.value)
      button.disabled = false
      if (!ok) {
        form.querySelector<HTMLElement>(".locked-error")!.hidden = false
        input.select()
        return
      }
      remember(input.value)
      await tryAll([input.value])
    })
  }
  const known = saved()
  if (known.length) void tryAll(known)
}
