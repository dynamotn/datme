import { type Lang } from "../site.config"
import { listed, type Layout, type Note } from "./vault"
import { slugTag } from "./slug"
import { t, type StringKey } from "./i18n"

/**
 * Page layouts a note asks for with its `layout` property. A résumé, a
 * gallery, a timeline and a page of links reshape the note's own text;
 * projects, books and movies list other notes, grouped by their `status`.
 */

/** Statuses in reading order, each with the spellings that mean it. */
const STATUSES: Record<Collection, [key: string, label: Extract<StringKey, `status${string}`>, spellings: string[]][]> = {
  projects: [
    ["active", "statusActive", ["active", "ongoing", "in-progress", "doing", "wip", "current"]],
    ["planned", "statusPlanned", ["planned", "idea", "todo", "next"]],
    ["paused", "statusPaused", ["paused", "on-hold", "hold"]],
    ["done", "statusDone", ["done", "completed", "finished", "shipped"]],
    ["archived", "statusArchived", ["archived", "abandoned", "dropped"]],
  ],
  books: [
    ["reading", "statusReading", ["reading", "current", "in-progress"]],
    ["to-read", "statusToRead", ["to-read", "want", "want-to-read", "tbr", "planned"]],
    ["read", "statusRead", ["read", "finished", "done", "completed"]],
    ["abandoned", "statusAbandoned", ["abandoned", "dnf", "dropped"]],
  ],
  movies: [
    ["watching", "statusWatching", ["watching", "current", "in-progress"]],
    ["to-watch", "statusToWatch", ["to-watch", "want", "want-to-watch", "watchlist", "planned"]],
    ["watched", "statusWatched", ["watched", "seen", "finished", "done", "completed"]],
    ["abandoned", "statusAbandoned", ["abandoned", "dropped"]],
  ],
}

export type Collection = "projects" | "books" | "movies"

export interface CollectionGroup {
  /** The status every note of the group has; "" for notes without one. */
  key: string
  label: string
  notes: Note[]
}

export const isCollection = (layout: Layout | undefined): layout is Collection =>
  layout === "projects" || layout === "books" || layout === "movies"

const normalize = (v: string) => v.trim().toLowerCase().replace(/[\s_]+/g, "-")

/** Plain text of a frontmatter value: a wikilink gives its alias or its name. */
export function plain(v: unknown): string {
  if (v == null) return ""
  if (Array.isArray(v)) return v.map(plain).filter(Boolean).join(", ")
  return String(v)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target.split("/").pop()!)
    .trim()
}

/** Where a collection takes its notes from: `from` (folders and #tags), else the note's own folder. */
export function sourcesOf(note: Note): { folders: string[]; tags: string[] } {
  const raw = note.source.fm.from
  const list = (Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw]).map((x) => plain(x))
  const folders: string[] = []
  const tags: string[] = []
  for (const item of list) {
    if (item.startsWith("#")) tags.push(slugTag(item.slice(1)))
    else folders.push(item.replace(/^\/+|\/+$/g, ""))
  }
  if (!folders.length && !tags.length) folders.push(note.dir)
  return { folders, tags }
}

/** When a note in a collection happened, for the newest-first order: its end, else its start. */
function dateOf(n: Note): number {
  const fm = n.source.fm
  for (const v of [fm.end, fm.finished, fm.watched, fm.start, fm.started]) {
    const d = v == null || v === "" ? NaN : new Date(String(v)).getTime()
    if (!Number.isNaN(d)) return d
  }
  return n.created?.getTime() ?? 0
}

/** The notes a collection page lists, grouped by status in reading order. */
export function collectionOf(note: Note, kind: Collection): CollectionGroup[] {
  const { folders, tags } = sourcesOf(note)
  const inFolder = (n: Note) => folders.some((f) => f === "" || n.dir === f || n.dir.startsWith(f + "/"))
  const tagged = (n: Note) => n.tags.some((tag) => tags.some((x) => tag === x || tag.startsWith(x + "/")))
  const notes = listed(note.lang).filter(
    (n) => n.key !== note.key && !n.isHome && !n.protected && n.layout !== note.layout && (inFolder(n) || tagged(n)),
  )
  const s = t(note.lang)
  const known = STATUSES[kind]
  const groups = new Map<string, CollectionGroup>()
  for (const n of notes) {
    const value = plain(n.source.fm.status)
    const status = known.find(([, , spellings]) => spellings.includes(normalize(value)))
    const key = status ? status[0] : value ? normalize(value) : ""
    if (!groups.has(key)) groups.set(key, { key, label: status ? s[status[1]] : value || s.statusOther, notes: [] })
    groups.get(key)!.notes.push(n)
  }
  const rank = (key: string) => {
    const i = known.findIndex(([k]) => k === key)
    return i >= 0 ? i : key ? known.length : known.length + 1
  }
  const collator = new Intl.Collator(note.lang, { numeric: true })
  for (const g of groups.values()) g.notes.sort((a, b) => dateOf(b) - dateOf(a) || collator.compare(a.title, b.title))
  return [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || collator.compare(a.label, b.label))
}

/** "2021 – 2023", "2024 – now": the years a project ran, from `start` and `end`. */
export function periodOf(n: Note, lang: Lang): string | undefined {
  const fm = n.source.fm
  const year = (v: unknown) => {
    if (v == null || v === "") return undefined
    const text = String(v)
    const d = new Date(text)
    return /^\d{4}$/.test(text) ? text : Number.isNaN(d.getTime()) ? text : String(d.getUTCFullYear())
  }
  const start = year(fm.start ?? fm.started)
  const end = year(fm.end ?? fm.finished)
  if (!start) return end
  if (!end) return `${start} – ${t(lang).now}`
  return start === end ? start : `${start} – ${end}`
}

/** A rating out of five, from a number or a run of stars. */
export function ratingOf(n: Note): number | undefined {
  const v = n.source.fm.rating
  if (v == null || v === "") return undefined
  const r = typeof v === "number" ? v : /^[★⭐]+$/u.test(String(v)) ? [...String(v)].length : Number(v)
  return Number.isFinite(r) && r > 0 ? Math.min(5, r) : undefined
}

/** Links of a project: `repo`, `url`, `demo` and every URL listed in `links`. */
export function linksOf(n: Note): { label: string; href: string }[] {
  const fm = n.source.fm
  const out: { label: string; href: string }[] = []
  const add = (label: string, v: unknown) => {
    for (const x of Array.isArray(v) ? v : [v]) {
      const href = typeof x === "string" ? x.trim() : ""
      if (/^https?:\/\//.test(href)) out.push({ label: label || new URL(href).hostname.replace(/^www\./, ""), href })
    }
  }
  add("", fm.repo)
  add("", fm.url)
  add("", fm.demo)
  const links = fm.links
  if (links && typeof links === "object" && !Array.isArray(links)) {
    for (const [label, v] of Object.entries(links as Record<string, unknown>)) add(label, v)
  } else add("", links)
  return out.filter((l, i) => out.findIndex((o) => o.href === l.href) === i)
}

const IMAGE_ONLY = /^(?:\s|<br\s*\/?>|<span class="image-embed">\s*<img\b[^>]*>\s*<\/span>|<img\b[^>]*>)+$/
const IMG = /<img\b[^>]*>/g

/**
 * A gallery: runs of paragraphs holding nothing but pictures become one grid,
 * each picture a figure captioned by its alt text. Text and headings stay, so
 * a heading starts an album.
 */
export function galleryHtml(html: string): string {
  const out: string[] = []
  let grid: string[] = []
  const flush = () => {
    if (grid.length) out.push(`<div class="gallery-grid">${grid.join("")}</div>`)
    grid = []
  }
  for (const part of html.split(/(<p>[\s\S]*?<\/p>)/)) {
    const inner = part.match(/^<p>([\s\S]*)<\/p>$/)?.[1]
    if (inner !== undefined && IMAGE_ONLY.test(inner) && inner.includes("<img")) {
      for (const img of inner.match(IMG)!) {
        const alt = img.match(/\balt="([^"]*)"/)?.[1] ?? ""
        grid.push(`<figure class="gallery-item">${img}${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>`)
      }
    } else if (part.trim() || !grid.length) {
      flush()
      out.push(part)
    }
  }
  flush()
  return out.join("")
}

/** What comes before the first H2, and each H2 split from the text below it. */
function sections(html: string): { intro: string; parts: { heading: string; body: string }[] } {
  const parts = html.split(/(?=<h2[\s>])/)
  const [intro, ...rest] = /^<h2[\s>]/.test(parts[0]) ? ["", ...parts] : parts
  return {
    intro,
    parts: rest.map((section) => {
      const end = section.indexOf("</h2>") + "</h2>".length
      return { heading: section.slice(0, end), body: section.slice(end) }
    }),
  }
}

/**
 * A résumé: each H2 section becomes a row with its heading beside its text;
 * what comes before the first H2 is the summary.
 */
export function cvHtml(html: string): string {
  const { intro, parts } = sections(html)
  const rows = parts.map((p) => `<section class="cv-section">${p.heading}<div class="cv-body">${p.body}</div></section>`)
  return (intro.trim() ? `<div class="cv-summary">${intro}</div>` : "") + rows.join("")
}

/**
 * A timeline: each H2 is a moment (a year, a date, a chapter of a life) on a
 * line running down the page, its text beside it; what comes first introduces it.
 */
export function timelineHtml(html: string): string {
  const { intro, parts } = sections(html)
  if (!parts.length) return html
  const events = parts.map((p) => `<li class="life-event">${p.heading}<div class="life-body">${p.body}</div></li>`)
  return intro + `<ol class="life-timeline">${events.join("")}</ol>`
}

/**
 * A page of links: every list whose items each start with a link becomes a
 * column of buttons; the words after a link describe it.
 */
export function linksHtml(html: string): string {
  return html.replace(/<ul>([\s\S]*?)<\/ul>/g, (list, inner: string) => {
    if (inner.includes("<ul") || inner.includes("<ol")) return list
    const items = inner.match(/<li>[\s\S]*?<\/li>/g) ?? []
    return items.length && items.every((li) => /^<li>\s*<a\s/.test(li)) ? `<ul class="link-hub">${inner}</ul>` : list
  })
}

/** A note's rendered text reshaped by its layout. */
export function layoutHtml(layout: Layout | undefined, html: string): string {
  switch (layout) {
    case "cv":
      return cvHtml(html)
    case "gallery":
      return galleryHtml(html)
    case "timeline":
      return timelineHtml(html)
    case "links":
      return linksHtml(html)
    default:
      return html
  }
}
