import { site } from "../site.config"
import type { Note } from "./vault"
import { dayNeighbours } from "./journal"
import { isOutdated } from "../scripts/outdated"

export interface Wilting {
  /** When the note was last tended. */
  since: Date
  /** Years after which it counts as outdated, from `outdated.after`. */
  after: number
  /** Whether it is outdated at build time; the browser checks again. */
  now: boolean
}

/**
 * Whether a note may be marked as outdated, and since when. Home and daily
 * notes never are: a daily note is about its day, being old is what it is for.
 */
export function wilting(note: Note): Wilting | undefined {
  const since = note.updated ?? note.created
  const after = site.outdated?.after
  if (!after || !since || note.isHome || note.source.fm.outdated === false || dayNeighbours(note)) return undefined
  return { since, after, now: isOutdated(since, after) }
}
