/**
 * Footprints: the notes a reader has opened, lit on the graph, and where
 * they stopped reading, offered on the home page. Kept in their browser
 * only, and forgotten when they ask.
 */
import { samePath } from "./data"

const KEY = "datme:visited"
/** Set while following "continue reading", so the note scrolls back to where the reader was. */
const RESTORE = "datme:restore"
/** Notes remembered at most; the oldest visits go first. */
export const MAX_VISITS = 2000

export interface Footprints {
  /** Path of each visited note, with when it was last opened (ms). */
  visits: Record<string, number>
  /** The note read last, its title, and how far down it the reader was (0 to 1). */
  last?: { u: string; t: string; y: number }
}

/** A path as footprints store it: decoded, without a trailing slash. */
const key = (path: string) => {
  try {
    path = decodeURI(path)
  } catch {
    // keep it raw
  }
  return path.replace(/\/+$/, "") || "/"
}

export function readFootprints(): Footprints {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}")
    const f = raw as Partial<Footprints>
    return { visits: f.visits && typeof f.visits === "object" ? f.visits : {}, last: f.last?.u ? f.last : undefined }
  } catch {
    return { visits: {} }
  }
}

function write(f: Footprints) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    // private mode: footprints last for this visit only
  }
}

/** Footprints with a visit added, keeping the newest MAX_VISITS. */
export function visit(f: Footprints, path: string, title: string, now: number, max = MAX_VISITS): Footprints {
  const visits = { ...f.visits, [key(path)]: now }
  const paths = Object.keys(visits)
  if (paths.length > max) {
    for (const p of paths.sort((a, b) => visits[a] - visits[b]).slice(0, paths.length - max)) delete visits[p]
  }
  return { visits, last: { u: key(path), t: title, y: f.last && samePath(f.last.u, path) ? f.last.y : 0 } }
}

export const hasVisited = (f: Footprints, path: string) => key(path) in f.visits

export function forgetFootprints(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing kept, nothing to forget
  }
}

/** How far down the page the reader is, from 0 to 1. */
const depth = () => {
  const max = document.documentElement.scrollHeight - innerHeight
  return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0
}

let saveTimer: number | undefined
let bound = false

export function setupFootprints(): void {
  const article = document.querySelector<HTMLElement>("article.note[data-key]")
  const here = location.pathname
  if (article) {
    const title = article.closest<HTMLElement>("[data-stack-col]")?.dataset.title ?? document.title
    write(visit(readFootprints(), here, title, Date.now()))
    let restore: string | null = null
    try {
      restore = sessionStorage.getItem(RESTORE)
      sessionStorage.removeItem(RESTORE)
    } catch {
      // no session storage: start at the top
    }
    const last = readFootprints().last
    if (restore && samePath(restore, here) && last && last.y > 0) {
      requestAnimationFrame(() => scrollTo({ top: last.y * (document.documentElement.scrollHeight - innerHeight) }))
    }
  }
  setupContinue()
  setupForget()
  if (bound) return
  bound = true
  // Where the reader is in the note they read last, saved as they scroll.
  addEventListener(
    "scroll",
    () => {
      clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        if (!document.querySelector("article.note[data-key]")) return
        const f = readFootprints()
        if (f.last && samePath(f.last.u, location.pathname)) write({ ...f, last: { ...f.last, y: Math.round(depth() * 1000) / 1000 } })
      }, 300)
    },
    { passive: true },
  )
  document.addEventListener("click", (e) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>("[data-continue] a")
    if (!link) return
    try {
      sessionStorage.setItem(RESTORE, new URL(link.href).pathname)
    } catch {
      // the note opens at the top
    }
  })
}

/** The "continue reading" card of the home page, when the reader left a note part way. */
function setupContinue() {
  const box = document.querySelector<HTMLElement>("[data-continue]")
  if (!box) return
  const last = readFootprints().last
  box.hidden = !last
  if (!last) return
  const a = box.querySelector("a")!
  a.href = last.u
  a.querySelector("[data-continue-title]")!.textContent = last.t
  const pct = box.querySelector<HTMLElement>("[data-continue-depth]")
  if (pct) pct.style.setProperty("--depth", `${Math.round(last.y * 100)}%`)
}

/** "Forget where I've been" in the reader menu. */
function setupForget() {
  const button = document.querySelector<HTMLButtonElement>("[data-forget-footprints]")
  if (!button || button.dataset.bound) return
  button.dataset.bound = "1"
  const label = button.textContent
  button.addEventListener("click", () => {
    forgetFootprints()
    button.textContent = button.dataset.done ?? label
    document.querySelectorAll<HTMLElement>("[data-continue]").forEach((b) => (b.hidden = true))
    document.dispatchEvent(new Event("footprints-forgotten"))
    setTimeout(() => (button.textContent = label), 1500)
  })
}
