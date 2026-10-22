import { site, type Lang } from "../site.config"
import { getVault, listed, countNotes } from "./vault"
import { renderNote } from "./markdown"
import { gardenShape } from "./check"
import { topics } from "./topics"
import { monthKey } from "./calendar"

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
  health: Health
}

/** How well connected and fresh the garden is; an indicator listed in stats.hide is left out. */
export interface Health {
  /** Links per note, and how that grew month by month: [YYYY-MM, links per note]. */
  density?: { now: number; trend: [string, number][] }
  /** Notes no one links to, and notes linking nowhere. */
  structure?: { orphans: number; deadEnds: number }
  /** Notes tended within the last 30, 90 and 365 days. */
  freshness?: { days: number; notes: number }[]
  /** The notes most linked to, most first. */
  hubs?: { title: string; url: string; count: number }[]
  /** Notes grouped by what they are about, largest topic first; with related.semantic only. */
  topics?: { label: string; notes: { title: string; url: string }[] }[]
}

const DAY = 86_400_000

/** Links per note by the end of each month: links between the notes planted by then, over their number. */
export function densityByMonth(notes: { created?: Date; links: string[]; key: string }[]): [string, number][] {
  const dated = notes.filter((n) => n.created)
  const months = cumulativeByMonth(dated.map((n) => n.created!)).map(([m]) => m)
  return months.map((m) => {
    const planted = new Set(dated.filter((n) => monthKey(n.created!) <= m).map((n) => n.key))
    const links = dated.filter((n) => planted.has(n.key)).reduce((sum, n) => sum + n.links.filter((k) => planted.has(k)).length, 0)
    return [m, Math.round((links / planted.size) * 100) / 100]
  })
}

/** Notes last tended within each number of days, as of `now`. */
export function freshnessCounts(dates: (Date | undefined)[], spans: number[], now = Date.now()): { days: number; notes: number }[] {
  return spans.map((days) => ({ days, notes: dates.filter((d) => d && now - d.getTime() <= days * DAY).length }))
}

/** Months from the first to the last, none skipped, so the curve keeps its real shape. */
export function cumulativeByMonth(dates: Date[]): [string, number][] {
  if (!dates.length) return []
  // By month, not by time: a date-only value counts in the month it is written in.
  const counts = new Map<string, number>()
  for (const d of dates) counts.set(monthKey(d), (counts.get(monthKey(d)) ?? 0) + 1)
  const months = [...counts.keys()].sort()
  const out: [string, number][] = []
  let total = 0
  let [y, m] = months[0].split("-").map(Number)
  for (m--; ; m++) {
    if (m > 11) y++, (m = 0)
    const k = `${y}-${String(m + 1).padStart(2, "0")}`
    total += counts.get(k) ?? 0
    out.push([k, total])
    if (k === months.at(-1)) break
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
  const hide = new Set(site.stats.hide)
  const keys = new Set(notes.map((n) => n.key))
  const outgoing = notes.map((n) => ({
    key: n.key,
    created: n.created,
    links: n.protected ? [] : [...new Set(n.links.map((l) => l.key))].filter((k) => k !== n.key && keys.has(k)),
  }))
  const health: Health = {}
  if (!hide.has("density")) {
    const total = outgoing.reduce((sum, n) => sum + n.links.length, 0)
    health.density = { now: notes.length ? Math.round((total / notes.length) * 100) / 100 : 0, trend: densityByMonth(outgoing) }
  }
  if (!hide.has("structure")) {
    const shape = gardenShape(lang)
    health.structure = {
      orphans: shape.orphans.filter((n) => keys.has(n.key)).length,
      deadEnds: shape.deadEnds.filter((n) => keys.has(n.key)).length,
    }
  }
  if (!hide.has("freshness"))
    health.freshness = freshnessCounts(
      notes.map((n) => n.updated ?? n.created),
      [30, 90, 365],
    )
  if (!hide.has("hubs")) {
    const backlinks = vault.backlinks[lang]
    health.hubs = notes
      .map((n) => ({ title: n.title, url: n.url, count: new Set((backlinks.get(n.key) ?? []).map((b) => b.note.key)).size }))
      .filter((h) => h.count > 0)
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, 5)
  }
  if (!hide.has("topics")) {
    const list = await topics(lang)
    if (list.length) health.topics = list.map((t) => ({ label: t.label, notes: t.items.map((i) => ({ title: i.note.title, url: i.note.url })) }))
  }
  return {
    health,
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
  return growth.map(([, n], i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - (n / max) * height).toFixed(1)}`).join(" ")
}
