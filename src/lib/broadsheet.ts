import type { Lang } from "~/site.config"
import { isDateOnly } from "./calendar"
import { byRecent, type Note } from "./vault"

/** Stories each section of the home front page shows under its label. */
export const SECTION_STORIES = 4

export interface FrontPage {
  /** The newest note, across the page's full width. */
  lead?: Note
  /** The other notes by top folder ("" for the root), newest first, in the order of their newest note. */
  sections: { dir: string; notes: Note[] }[]
}

/**
 * A broadsheet front page: the newest note leads, the others follow in
 * sections, one per top folder, each cut to `perSection` stories.
 */
export function frontPage(notes: Note[], perSection = SECTION_STORIES): FrontPage {
  const [lead, ...rest] = byRecent(notes, "created")
  const sections = new Map<string, Note[]>()
  for (const note of rest) {
    const dir = note.dir.split("/")[0]
    const list = sections.get(dir) ?? []
    if (!sections.has(dir)) sections.set(dir, list)
    if (list.length < perSection) list.push(note)
  }
  return { lead, sections: [...sections].map(([dir, list]) => ({ dir, notes: list })) }
}

/** The date line under the masthead: the weekday and the date in full, in the page's language. */
export function editionDate(date: Date, lang: Lang): string {
  // As formatDate: a date-only value is UTC midnight, kept on its own day.
  const timeZone = isDateOnly(date) ? "UTC" : undefined
  return date.toLocaleDateString(lang, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone })
}
