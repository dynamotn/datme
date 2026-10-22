import { samePath } from "./data"
import { withBase } from "./base"

/**
 * Pages carry only part of the explorer (src/lib/explorer.ts): the top level
 * and the folders holding the page. The whole tree is loaded once the sidebar
 * is on screen and the browser is idle, or as soon as the reader reaches for
 * it, and takes the part's place with the same folders open and the same note
 * marked. The sidebar persists across navigations, so this happens once.
 */

const OPEN_KEY = "explorer-open"
const trees = new Map<string, Promise<string>>()

function fetchTree(lang: string): Promise<string> {
  let hit = trees.get(lang)
  if (!hit) {
    const url = withBase(`/static/explorer.${lang}.html`)
    hit = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`)
      return r.text()
    })
    // A failure, such as being offline, is not kept: the next attempt tries again.
    hit.catch(() => trees.delete(lang))
    trees.set(lang, hit)
  }
  return hit
}

function openFolders(): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]")
    return new Set(Array.isArray(list) ? list.filter((d) => typeof d === "string") : [])
  } catch {
    return new Set()
  }
}

function remember(d: HTMLDetailsElement) {
  const set = openFolders()
  if (d.open) set.add(d.dataset.dir!)
  else set.delete(d.dataset.dir!)
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...set]))
  } catch {
    // private mode: folders just won't stay open
  }
}

/** The link of the current page in the explorer, as src/scripts/app.ts marks it. */
const currentLink = (explorer: HTMLElement) =>
  [...explorer.querySelectorAll<HTMLAnchorElement>("a")].find((a) => samePath(new URL(a.href, location.href).pathname, location.pathname))

/** The element scrolling the explorer, if any does. */
function scroller(el: HTMLElement): HTMLElement | undefined {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p
  }
  return undefined
}

function swap(explorer: HTMLElement, html: string) {
  if (!explorer.isConnected || !explorer.hasAttribute("data-explorer-partial")) return
  const focused = explorer.contains(document.activeElement) ? document.activeElement : null
  const focusHref = focused?.tagName === "A" ? focused.getAttribute("href") : null
  const focusDir = focused?.closest("details")?.dataset.dir
  const before = currentLink(explorer)?.getBoundingClientRect().top
  const box = scroller(explorer)

  explorer.innerHTML = html
  explorer.removeAttribute("data-explorer-partial")
  const open = openFolders()
  explorer.querySelectorAll<HTMLDetailsElement>("details").forEach((d) => {
    if (open.has(d.dataset.dir!)) d.open = true
    d.addEventListener("toggle", () => remember(d))
  })
  const active = currentLink(explorer)
  if (active) {
    active.setAttribute("aria-current", "page")
    const own = active.classList.contains("folder-link") ? active.parentElement?.querySelector<HTMLDetailsElement>(":scope > details") : null
    for (let d: HTMLDetailsElement | null | undefined = own ?? active.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true
    // Folders opened above it would push the current note down: the sidebar keeps it where it was.
    if (box && before !== undefined) box.scrollTop += active.getBoundingClientRect().top - before
  }
  // Focus stays on the same link or folder.
  const target = focusHref
    ? [...explorer.querySelectorAll<HTMLElement>("a")].find((a) => a.getAttribute("href") === focusHref)
    : focusDir !== undefined
      ? [...explorer.querySelectorAll<HTMLDetailsElement>("details")].find((d) => d.dataset.dir === focusDir)?.querySelector<HTMLElement>(":scope > summary")
      : undefined
  target?.focus({ preventScroll: true })
}

/** Loads the whole tree into the explorer, when it holds only part of it. */
export async function ensureExplorer(): Promise<void> {
  const explorer = document.querySelector<HTMLElement>("[data-explorer][data-explorer-partial]")
  if (!explorer) return
  try {
    swap(explorer, await fetchTree(explorer.dataset.explorer!))
  } catch {
    // Offline: the part stays, and its links still work.
  }
}

let observer: IntersectionObserver | undefined

const idle = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200))

function setup() {
  observer?.disconnect()
  const explorer = document.querySelector<HTMLElement>("[data-explorer][data-explorer-partial]")
  if (!explorer) return
  if (!("IntersectionObserver" in window)) return void idle(() => void ensureExplorer())
  // The drawer of a phone stays closed until opened: the tree loads when it shows.
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return
    observer?.disconnect()
    idle(() => void ensureExplorer())
  })
  observer.observe(explorer)
}

// Reaching for the explorer loads it at once: a folder opened while it held only part fills in.
const reach = (e: Event) => {
  if (e.target instanceof Element && e.target.closest("[data-explorer-partial]")) void ensureExplorer()
}
document.addEventListener("pointerover", reach, { passive: true })
document.addEventListener("focusin", reach)
// Only a folder opened empty: the page's own folders arrive open, with their notes.
document.addEventListener(
  "toggle",
  (e) => {
    const d = e.target as HTMLDetailsElement
    if (d instanceof Element && d.tagName === "DETAILS" && d.open && d.querySelector(":scope > ul:empty")) reach(e)
  },
  true,
)
document.addEventListener("astro:page-load", setup)
