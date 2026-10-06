import { site, type Lang } from "../site.config"
import { getVault, listed, countNotes } from "./vault"
import { renderNote } from "./markdown"

export interface Stats {
  notes: number
  words: number
  links: number
  tags: number
  /** Notes created by the end of each month, oldest first: [YYYY-MM, total]. */
  growth: [string, number][]
  /** Notes per top-level folder (stage), largest first. */
  folders: { label: string; count: number }[]
  /** The most used tags, with how many notes carry them. */
  topTags: { tag: string; count: number }[]
}

/** Months from the first to the last, none skipped, so the curve keeps its real shape. */
export function cumulativeByMonth(dates: Date[]): [string, number][] {
  if (!dates.length) return []
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  const counts = new Map<string, number>()
  for (const d of dates) counts.set(key(d), (counts.get(key(d)) ?? 0) + 1)
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
  const out: [string, number][] = []
  let total = 0
  for (let y = sorted[0].getFullYear(), m = sorted[0].getMonth(); ; m++) {
    if (m > 11) (y++, (m = 0))
    const k = `${y}-${String(m + 1).padStart(2, "0")}`
    total += counts.get(k) ?? 0
    out.push([k, total])
    if (k === key(sorted.at(-1)!)) break
  }
  return out
}

export async function gardenStats(lang: Lang): Promise<Stats> {
  const vault = getVault()
  const notes = listed(lang).filter((n) => !n.isHome)
  let words = 0
  for (const n of notes) words += (await renderNote(n)).words
  const links = notes.reduce((sum, n) => sum + (n.protected ? 0 : new Set(n.links.map((l) => l.key)).size), 0)
  // Type tags (type/book) and their bare parent describe what notes are, not what they are about.
  const prefix = site.conventions.typePrefix
  const tags = [...vault.tags[lang]].filter(([t]) => !t.startsWith(prefix) && t + "/" !== prefix)
  const folders = vault.trees[lang].folders
    .map((f) => ({ label: site.stages[f.segment] ? `${site.stages[f.segment].icon} ${site.stages[f.segment].label[lang]}` : f.name, count: countNotes(f) }))
    .sort((a, b) => b.count - a.count)
  return {
    notes: notes.length,
    words,
    links,
    tags: tags.length,
    growth: cumulativeByMonth(notes.flatMap((n) => (n.created ? [n.created] : []))),
    folders,
    topTags: tags
      .map(([tag, list]) => ({ tag, count: list.length }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 10),
  }
}

/** The growth curve as an SVG path in a width × height box. */
export function growthPath(growth: [string, number][], width: number, height: number): string {
  if (!growth.length) return ""
  const max = Math.max(1, ...growth.map(([, n]) => n))
  const step = growth.length > 1 ? width / (growth.length - 1) : 0
  return growth
    .map(([, n], i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - (n / max) * height).toFixed(1)}`)
    .join(" ")
}
