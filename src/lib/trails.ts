import type { Lang } from "../site.config"
import { getVault, type Note } from "./vault"

/**
 * Guided trails: a note with `trail: true` lists a path through the garden,
 * one step per item of a list that starts with a link to a note. The rest of
 * the item is what the guide says about that stop:
 *
 *   ---
 *   trail: true
 *   ---
 *   1. [[Zettelkasten]] — where it all starts
 *   2. [[Niklas Luhmann]]: the man behind the slip box
 *
 * Unlike a series, a trail does not belong to its notes: it can cross folders,
 * and a note can be a stop on several trails.
 */

export interface TrailStep {
  note: Note
  /** The guide's words for this stop, as plain text. */
  says: string
}

export interface Trail {
  note: Note
  steps: TrailStep[]
}

export interface TrailPlace {
  trail: Trail
  /** 0-based position of the note on the trail. */
  index: number
  prev?: Note
  next?: Note
}

/** Whether a note's frontmatter makes it a trail. */
export const isTrail = (fm: Record<string, unknown>) => fm.trail === true || fm.trail === "true"

/** Only top-level items: a nested one is a detail of the stop above it. */
const LIST_ITEM = /^(?:\d+[.)]|[-*+])\s+(.*)$/
/** A link to a note, as the converter writes it: the first thing of the item. */
const LEAD_LINK = /^(?:\*\*|__|\*|_)?<a [^>]*?class="internal" data-key="([^"]+)"[^>]*>[\s\S]*?<\/a>(?:\*\*|__|\*|_)?/

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

/**
 * The steps of a trail, read from its converted markdown: each top-level list
 * item that starts with a link to a published note of the same language.
 */
export function trailSteps(md: string, byKey: Map<string, Note>): TrailStep[] {
  const steps: TrailStep[] = []
  for (const line of md.split("\n")) {
    const item = line.match(LIST_ITEM)
    const link = item?.[1].match(LEAD_LINK)
    const note = link && byKey.get(decode(link[1]))
    if (!item || !link || !note) continue
    const says = item[1]
      .slice(link[0].length)
      .replace(/<[^>]+>/g, "")
      .replace(/[*_`=]+/g, "")
      .replace(/^\s*(?:[—–:-]|\|)\s*/, "")
      .trim()
    steps.push({ note, says: decode(says) })
  }
  return steps
}

const cache = new Map<string, Map<string, Trail>>()

/** Every trail of a language with at least one step, by the key of its note. */
export function allTrails(lang: Lang): Map<string, Trail> {
  const vault = getVault()
  const id = `${vault.version}:${lang}`
  let hit = cache.get(id)
  if (hit) return hit
  hit = new Map()
  for (const n of vault.notes[lang]) {
    if (!isTrail(n.source.fm) || n.protected) continue
    const steps = trailSteps(n.md, vault.byKey[lang]).filter((s) => s.note !== n)
    if (steps.length) hit.set(n.key, { note: n, steps })
  }
  cache.set(id, hit)
  return hit
}

/** The trails a note is a stop on, with where it stands on each; a note listed twice counts at its first stop. */
export function trailsOf(note: Note): TrailPlace[] {
  const out: TrailPlace[] = []
  for (const trail of allTrails(note.lang).values()) {
    const index = trail.steps.findIndex((s) => s.note === note)
    if (index < 0) continue
    out.push({ trail, index, prev: trail.steps[index - 1]?.note, next: trail.steps[index + 1]?.note })
  }
  return out
}
