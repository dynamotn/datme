/**
 * What a reader ticked on a page, kept in their browser: the lessons of a
 * syllabus done, the items of a checklist. One list per kind and page,
 * whatever the trailing slash of its address.
 */
import { deckPath } from "./practice"

const key = (kind: string, path: string) => `datme:${kind}:${deckPath(path)}`

/** The ids ticked on a page; null when nothing is kept for it. */
export function loadTicks(kind: string, path: string): string[] | null {
  try {
    const raw = localStorage.getItem(key(kind, path))
    if (raw === null) return null
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []
  } catch {
    // unreadable or blocked storage: nothing kept
    return null
  }
}

/** Keep the ids ticked on a page; null forgets them. */
export function saveTicks(kind: string, path: string, ticks: string[] | null): void {
  try {
    if (ticks) localStorage.setItem(key(kind, path), JSON.stringify(ticks))
    else localStorage.removeItem(key(kind, path))
  } catch {
    // private mode: the ticks last for this visit only
  }
}
