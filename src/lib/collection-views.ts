/**
 * What the collections of a kind of their own show of each note: a journal's
 * days and tracked numbers, a bookmark's source, a person's face and ties, a
 * snippet's code, an episode's sound.
 */
import { getVault, type Note } from "./vault"
import { chartHtml } from "./charts"
import { profileOf } from "./footer"
import { field, noteDay, plain } from "./note-layouts"

/** A list property: a YAML list, or names joined by commas. */
export const listOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(plain) : plain(v).split(/\s*,\s*/)).filter(Boolean)

// ---------- daily ----------

/** The notes of a journal by their day, YYYY-MM-DD; a note without a day is left out. */
export function dailyDays(notes: Note[]): Map<string, Note[]> {
  const days = new Map<string, Note[]>()
  for (const n of notes) {
    const day = noteDay(n)
    if (day) days.set(day, [...(days.get(day) ?? []), n])
  }
  return days
}

/** A number written in a property, undefined for anything else. */
function numberOf(v: unknown): number | undefined {
  const x = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
  return Number.isFinite(x) ? x : undefined
}

/** Each numeric property a journal tracks (`track: [mood, sleep]`), as a line chart over its days, oldest first. */
export function trackCharts(note: Note, days: Map<string, Note[]>): string[] {
  const sorted = [...days].sort(([a], [b]) => a.localeCompare(b))
  return listOf(note.source.fm.track).flatMap((prop) => {
    const points = sorted.flatMap(([day, notes]) => {
      const v = notes.map((n) => numberOf(n.source.fm[prop])).find((x) => x !== undefined)
      return v === undefined ? [] : [[day, v] as const]
    })
    if (!points.length) return []
    return [
      chartHtml({
        type: "line",
        labels: points.map(([day]) => day),
        series: [{ title: prop, data: points.map(([, v]) => v) }],
        stacked: false,
        fill: false,
        tension: 0.3,
        beginAtZero: false,
        indexAxis: "x",
      }),
    ]
  })
}

/** The tracked values of a day, as "mood 4 · sleep 7". */
export function trackedOf(note: Note, n: Note): string[] {
  return listOf(note.source.fm.track).flatMap((prop) => {
    const v = numberOf(n.source.fm[prop])
    return v === undefined ? [] : [`${prop} ${v}`]
  })
}

// ---------- bookmarks ----------

export interface Bookmark {
  /** The page clipped: `source`, else `url`. */
  href?: string
  /** Its host, without www. */
  site?: string
  /** The logo of a site datme knows (24×24 path); others get the host's first letter. */
  icon?: string
  /** The letter standing for a site without a logo. */
  letter: string
  published?: Date
}

export function bookmarkOf(n: Note): Bookmark {
  const href = [n.source.fm.source, n.source.fm.url].map(plain).find((u) => /^https?:\/\//.test(u))
  if (!href) return { letter: [...n.title][0]?.toUpperCase() ?? "?" }
  const site = new URL(href).hostname.replace(/^www\./, "")
  const published = new Date(plain(n.source.fm.published))
  return {
    href,
    site,
    icon: profileOf(href).path,
    letter: site[0].toUpperCase(),
    published: Number.isNaN(published.getTime()) ? undefined : published,
  }
}

/**
 * Text of the first paragraph of a rendered note, its tags taken out and its
 * entities kept, so it goes back into a page as HTML; "" when it has none.
 */
export function firstParagraph(html: string): string {
  for (const m of html.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const text = m[1].replace(/<[^>]*>/g, "").trim()
    if (text) return text
  }
  return ""
}

// ---------- people ----------

/** Initials of a name, at most two: its first and last words. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  const first = (w: string | undefined) => (w ? [...w][0].toUpperCase() : "")
  return first(words[0]) + (words.length > 1 ? first(words.at(-1)) : "")
}

/** The links between people of a collection, each pair once, either way round. */
export function peopleTies(people: Note[]): [Note, Note][] {
  const listed = new Map(people.map((p) => [p.key, p]))
  const ties = new Map<string, [Note, Note]>()
  for (const p of people) {
    for (const b of getVault().backlinks[p.lang].get(p.key) ?? []) {
      const other = listed.get(b.note.key)
      if (!other || other.key === p.key) continue
      const id = [p.key, other.key].sort().join("\n")
      if (!ties.has(id)) ties.set(id, [other, p])
    }
  }
  return [...ties.values()]
}

// ---------- snippets ----------

export interface Snippet {
  /** The first code block of the note, as Shiki highlighted it. */
  code?: string
  /** Its `language`, else the language of the block; "" for plain text. */
  language: string
}

export function snippetOf(n: Note, html: string): Snippet {
  const code = html.match(/<pre class="shiki[\s\S]*?<\/pre>/)?.[0]
  const named = code?.match(/<code class="language-([^"\s]+)/)?.[1]
  const language = field(n, "language") || (named && named !== "text" ? named : "")
  return { code, language }
}

// ---------- episodes ----------

const AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
}

/** The media type of a sound by its extension, MP3 when it has none known. */
export const audioType = (href: string) => AUDIO_TYPES[href.split(/[?#]/)[0].split(".").pop()!.toLowerCase()] ?? "audio/mpeg"
