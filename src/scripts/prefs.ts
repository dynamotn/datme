/**
 * Reading preferences kept in the reader's browser: text size, a font made
 * for legibility, high contrast, and the speed notes are read aloud at. The
 * <head> script of the layout applies them before the first paint; this
 * module offers the controls.
 */

export interface Prefs {
  /** Text size of notes, as a factor of the normal size. */
  size: number
  legible: boolean
  contrast: boolean
  /** Speed of reading a note aloud, as a factor of the voice's own. */
  rate: number
}

export const SIZES = [0.85, 1, 1.15, 1.3, 1.5]
export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
const KEY = "prefs"
const FONT_URL = "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap"

export function parsePrefs(raw: string | null): Prefs {
  try {
    const p = JSON.parse(raw ?? "{}") as Partial<Prefs>
    return {
      size: SIZES.includes(Number(p.size)) ? Number(p.size) : 1,
      legible: p.legible === true,
      contrast: p.contrast === true,
      rate: RATES.includes(Number(p.rate)) ? Number(p.rate) : 1,
    }
  } catch {
    return { size: 1, legible: false, contrast: false, rate: 1 }
  }
}

/** The next size up or down, staying within the offered sizes. */
export function step(size: number, by: number): number {
  const i = SIZES.indexOf(size)
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, (i < 0 ? 1 : i) + by))]
}

export function applyPrefs(root: HTMLElement, p: Prefs): void {
  root.style.setProperty("--reading-scale", String(p.size))
  root.classList.toggle("font-legible", p.legible)
  root.classList.toggle("high-contrast", p.contrast)
  // The legible font is only fetched once a reader asks for it.
  const doc = root.ownerDocument
  if (p.legible && !doc.querySelector("link[data-legible-font]")) {
    const link = doc.createElement("link")
    link.rel = "stylesheet"
    link.href = FONT_URL
    link.dataset.legibleFont = ""
    doc.head.append(link)
  }
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(KEY))
  } catch {
    return parsePrefs(null)
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // private mode: the preference lasts for this page only
  }
}

/** The "Aa" menu of the header; header nodes are swapped on navigation, so it re-binds each time. */
export function setupPrefs(): void {
  const toggle = document.querySelector<HTMLButtonElement>("[data-prefs-toggle]")
  const panel = document.querySelector<HTMLElement>("[data-prefs-panel]")
  if (!toggle || !panel || panel.dataset.bound) return
  panel.dataset.bound = "1"
  const root = document.documentElement
  let prefs = loadPrefs()
  const sync = () => {
    applyPrefs(root, prefs)
    panel.querySelector("[data-pref-size-out]")!.textContent = `${Math.round(prefs.size * 100)}%`
    panel.querySelectorAll<HTMLInputElement>("input[data-pref]").forEach((i) => (i.checked = prefs[i.dataset.pref as "legible" | "contrast"]))
  }
  sync()
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden
    toggle.setAttribute("aria-expanded", String(!panel.hidden))
  })
  panel.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pref-size]")
    if (!b) return
    prefs = { ...prefs, size: step(prefs.size, Number(b.dataset.prefSize)) }
    savePrefs(prefs)
    sync()
  })
  panel.addEventListener("change", (e) => {
    const i = e.target as HTMLInputElement
    if (!i.dataset.pref) return
    prefs = { ...prefs, [i.dataset.pref]: i.checked }
    savePrefs(prefs)
    sync()
  })
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !(e.target as HTMLElement).closest("[data-prefs-panel], [data-prefs-toggle]")) {
      panel.hidden = true
      toggle.setAttribute("aria-expanded", "false")
    }
  })
}
