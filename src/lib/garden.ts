import { site, type Lang, type StageDef } from "~/site.config"
import { folderDisplayName } from "./slug"
import type { Note } from "./vault"

export type TileSize = "small" | "medium" | "large"

/** Tiles in the "recently tended" row. */
export const RECENT_TILES = 6
/** Tiles of the home bed before "walk the whole garden". */
export const HOME_TILES = 60
/** Tags offered by the tag select. */
export const FILTER_TAGS = 12

/** Stage keys, least to most mature. */
function ranked(stages: Record<string, StageDef>): string[] {
  return Object.keys(stages).sort((a, b) => stages[a].order - stages[b].order)
}

/** The least mature stage is small, the most mature large; with fewer than two stages, all are medium. */
export function tileSize(stage: string | undefined, stages: Record<string, StageDef> = site.stages): TileSize {
  const keys = ranked(stages)
  if (!stage || keys.length < 2) return "medium"
  const i = keys.indexOf(stage)
  if (i < 0) return "medium"
  if (i === 0) return "small"
  return i === keys.length - 1 ? "large" : "medium"
}

/** Most mature first, then newest first; notes without a stage, or without a date, come last. */
export function gardenOrder<T extends Pick<Note, "stage" | "updated">>(notes: T[], stages: Record<string, StageDef> = site.stages): T[] {
  const rank = (n: T) => (n.stage && stages[n.stage] ? stages[n.stage].order : -1)
  const time = (n: T) => n.updated?.getTime() ?? -Infinity
  return [...notes].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(b) - rank(a)
    if (time(a) === time(b)) return 0
    return time(a) < time(b) ? 1 : -1
  })
}

export interface GardenChip {
  kind: "stage" | "folder"
  value: string
  icon: string
  label: string
  count: number
}

/** One chip per stage that has notes, or per top-level folder when the vault has no stages. */
export function gardenChips(notes: Note[], lang: Lang, stages: Record<string, StageDef> = site.stages): GardenChip[] {
  const keys = ranked(stages)
  const counts = new Map<string, number>()
  if (keys.length) {
    for (const n of notes) if (n.stage) counts.set(n.stage, (counts.get(n.stage) ?? 0) + 1)
    return keys
      .filter((k) => counts.has(k))
      .map((k) => ({ kind: "stage", value: k, icon: stages[k].icon, label: stages[k].label[lang] ?? k, count: counts.get(k)! }))
  }
  for (const n of notes) {
    const top = n.dir.split("/")[0]
    if (top) counts.set(top, (counts.get(top) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ kind: "folder", value, icon: "📁", label: folderDisplayName(value), count }))
}

/** The most used tags, type tags left out. */
export function topTags(notes: Pick<Note, "tags">[], n = FILTER_TAGS): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const note of notes) for (const tag of note.tags) if (!tag.startsWith(site.conventions.typePrefix)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, n)
}
