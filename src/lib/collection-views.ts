/**
 * What the collections of a kind of their own show of each note: a journal's
 * days and tracked numbers, a bookmark's source, a person's face and ties, a
 * snippet's code, an episode's sound, a wishlist's totals, the quotes of a
 * quotebook and the weeks of a digest.
 */
import type { Lang } from "../site.config"
import { getVault, type Note } from "./vault"
import { chartHtml } from "./charts"
import { profileOf } from "./footer"
import { renderNote } from "./markdown"
import { noteChanges } from "./changes"
import { t } from "./i18n"
import { field, formatPrice, noteDay, plain, priceOf, quotesOf, textOf, type Spec } from "./note-layouts"

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

// ---------- wishlist ----------

/** What the wishes of a group cost together, one sum per currency, in the order they first come. */
export function priceTotals(notes: Note[], lang: Lang): string[] {
  const sums = new Map<string, number>()
  for (const n of notes) {
    const price = priceOf(n)
    if (price) sums.set(price.currency ?? "", (sums.get(price.currency ?? "") ?? 0) + price.amount)
  }
  return [...sums].map(([currency, amount]) => formatPrice(amount, currency || undefined, lang))
}

// ---------- quotebook ----------

/** Percent-encode a part of a text fragment, as the share button does; "-", "," and "&" are reserved too. */
const fragmentPart = (s: string) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C").replace(/&/g, "%26")

/** Where a quote is in its note: its block id, else a text fragment of its first words. */
export function passageUrl(n: Note, text: string, id?: string): string {
  // Block ids link as Obsidian writes them, as links to them do: Note#^id.
  if (id) return `${n.url}#${id}`
  const words = textOf(text).split(" ").filter(Boolean)
  return words.length ? `${n.url}#:~:text=${fragmentPart(words.slice(0, 8).join(" "))}` : n.url
}

export interface Quote {
  /** The quote, as HTML. */
  text: string
  /** Who said it, as HTML. */
  who: string
  note: Note
  /** The passage in its note. */
  href: string
}

export interface QuoteGroup {
  key: string
  label: string
  /** The note of a group by source. */
  note?: Note
  quotes: Quote[]
}

/**
 * Every quote of the notes of a quotebook, grouped by who said it (A–Z), by
 * the note it is in (`group: source`, in the collection's order) or not at
 * all (`group: none`). A protected note renders as nothing, so it has none.
 */
export async function quotebookOf(note: Note, spec: Spec, notes: Note[]): Promise<QuoteGroup[]> {
  const quotes = (
    await Promise.all(
      notes.map(async (n) => quotesOf((await renderNote(n)).html).map((q) => ({ text: q.text, who: q.who, note: n, href: passageUrl(n, q.text, q.id) }))),
    )
  ).flat()
  if (spec.group === "none") return quotes.length ? [{ key: "", label: "", quotes }] : []
  const bySource = spec.group === "source"
  const groups = new Map<string, QuoteGroup>()
  for (const q of quotes) {
    const label = bySource ? q.note.title : textOf(q.who)
    const key = bySource ? q.note.key : label.toLocaleLowerCase(note.lang)
    if (!groups.has(key)) groups.set(key, { key, label, note: bySource ? q.note : undefined, quotes: [] })
    groups.get(key)!.quotes.push(q)
  }
  const collator = new Intl.Collator(note.lang, { numeric: true, sensitivity: "base" })
  return bySource ? [...groups.values()] : [...groups.values()].sort((a, b) => collator.compare(a.label, b.label))
}

// ---------- digest ----------

/** The ISO week of a day (UTC): its year, its number, and its Monday and Sunday as YYYY-MM-DD. */
export function isoWeek(d: Date): { id: string; year: number; week: number; start: string; end: string } {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const monday = new Date(day)
  monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  // The week belongs to the year of its Thursday.
  const thursday = new Date(monday)
  thursday.setUTCDate(monday.getUTCDate() + 3)
  const year = thursday.getUTCFullYear()
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 / 7) + 1
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  return { id: `${year}-W${String(week).padStart(2, "0")}`, year, week, start: iso(monday), end: iso(sunday) }
}

export interface DigestEntry {
  note: Note
  date: Date
  /** The note's history page for a change it has one of, else the note. */
  url: string
}

export interface DigestWeek {
  /** 2026-W42, also the anchor of the week. */
  id: string
  label: string
  start: string
  end: string
  planted: DigestEntry[]
  tended: DigestEntry[]
}

/**
 * A weekly digest of the notes of a collection: those planted (created) and
 * tended (updated) each ISO week, newest week first, `limit` weeks (8 by
 * default). With `history: true` (and history on for the site) every public
 * version from git counts, as on the changes page; otherwise a note's
 * created and updated dates. Drafts are left out.
 */
export function digestOf(note: Note, notes: Note[]): DigestWeek[] {
  const s = t(note.lang)
  const fromHistory = note.source.fm.history === true
  const events: (DigestEntry & { planted: boolean })[] = []
  for (const n of notes) {
    if (n.draft) continue
    const changes = fromHistory ? noteChanges(n) : []
    if (changes.length) {
      events.push(...changes.map((c) => ({ note: n, date: c.date, url: c.url, planted: c.planted })))
      continue
    }
    if (n.created) events.push({ note: n, date: n.created, url: n.url, planted: true })
    if (n.updated && (!n.created || isoWeek(n.updated).id !== isoWeek(n.created).id)) events.push({ note: n, date: n.updated, url: n.url, planted: false })
  }
  const weeks = new Map<string, DigestWeek>()
  // Newest first, so the weeks come in that order too.
  for (const e of events.sort((a, b) => b.date.getTime() - a.date.getTime())) {
    const w = isoWeek(e.date)
    if (!weeks.has(w.id)) {
      const label = s.digestWeek.replace("{week}", String(w.week)).replace("{year}", String(w.year))
      weeks.set(w.id, { id: w.id, label, start: w.start, end: w.end, planted: [], tended: [] })
    }
    const week = weeks.get(w.id)!
    // A note planted in a week is not also tended in it, and is tended once, at its latest change.
    const seen = [...week.planted, ...week.tended].find((x) => x.note.key === e.note.key)
    if (e.planted) {
      week.tended = week.tended.filter((x) => x.note.key !== e.note.key)
      week.planted.push({ note: e.note, date: e.date, url: e.url })
    } else if (!seen) week.tended.push({ note: e.note, date: e.date, url: e.url })
  }
  const asked = Number(note.source.fm.limit)
  return [...weeks.values()].slice(0, asked > 0 ? asked : 8)
}
