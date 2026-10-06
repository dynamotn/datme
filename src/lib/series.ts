import type { Lang } from "../site.config"
import { getVault, type Note } from "./vault"

export interface Series {
  /** Shown name: the `series` value, or the title of the note it links to. */
  name: string
  /** The note introducing the series, when `series` is a [[link]]. */
  intro?: Note
  parts: Note[]
}

export interface SeriesPlace {
  series: Series
  /** 0-based position of the note in its series. */
  index: number
  prev?: Note
  next?: Note
}

const cache = new Map<string, Map<string, Series>>()

/** Every series of a language, by the raw `series` value its notes share. */
export function allSeries(lang: Lang): Map<string, Series> {
  const vault = getVault()
  const id = `${vault.version}:${lang}`
  let hit = cache.get(id)
  if (hit) return hit
  hit = new Map()
  for (const n of vault.notes[lang]) {
    const raw = n.source.fm.series
    if (typeof raw !== "string" || !raw.trim()) continue
    const key = raw.trim()
    let s = hit.get(key)
    if (!s) {
      const link = key.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/)
      const target = link ? vault.resolveNote(link[1], n.dir) : undefined
      const intro = target ? vault.byKey[lang].get(target.key) : undefined
      s = { name: link ? (link[2] ?? intro?.title ?? link[1]) : key, intro, parts: [] }
      hit.set(key, s)
    }
    s.parts.push(n)
  }
  const order = (n: Note) => {
    const v = Number(n.source.fm.series_order ?? n.source.fm.seriesOrder)
    return Number.isFinite(v) ? v : Infinity
  }
  const collator = new Intl.Collator(lang, { numeric: true })
  for (const s of hit.values()) {
    s.parts.sort(
      (a, b) =>
        order(a) - order(b) ||
        (a.created?.getTime() ?? 0) - (b.created?.getTime() ?? 0) ||
        collator.compare(a.title, b.title),
    )
  }
  cache.set(id, hit)
  return hit
}

/** Where a note stands in its series, if it belongs to one with another part. */
export function seriesOf(note: Note): SeriesPlace | undefined {
  const raw = note.source.fm.series
  if (typeof raw !== "string") return undefined
  const series = allSeries(note.lang).get(raw.trim())
  if (!series || series.parts.length < 2) return undefined
  const index = series.parts.indexOf(note)
  return { series, index, prev: series.parts[index - 1], next: series.parts[index + 1] }
}
