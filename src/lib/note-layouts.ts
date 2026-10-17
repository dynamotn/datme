import { type Lang } from "../site.config"
import { getVault, listed, type Layout, type Note } from "./vault"
import { slugTag } from "./slug"
import { formatDate, t, type StringKey } from "./i18n"
import { engineFor } from "./dataview-render"
import { parseBase, runView, type BaseFile } from "./bases"
import { parseLocation, type Place } from "./places"

/**
 * Page layouts a note asks for with its `layout` property. Some reshape the
 * note's own text (a résumé, a gallery, a timeline, links, uses, a FAQ,
 * quotes); collections list other notes, grouped by status, year or any
 * property. A collection whose note embeds a base lists what the base finds,
 * in its order and groups.
 */

export type Collection = "projects" | "books" | "movies" | "talks" | "recipes" | "places" | "shelf"
const COLLECTIONS: Collection[] = ["projects", "books", "movies", "talks", "recipes", "places", "shelf"]

export const isCollection = (layout: Layout | undefined): layout is Collection => COLLECTIONS.includes(layout as Collection)

type StatusLabel = Extract<StringKey, `status${string}`>

/** Statuses in reading order, each with the spellings that mean it. */
const STATUSES: Partial<Record<Collection, [key: string, label: StatusLabel, spellings: string[]][]>> = {
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

/** How a collection looks: cards, a shelf of covers, or a list of dated rows. */
export type Look = "cards" | "shelf" | "rows"

/** A collection as its note sets it up: the preset of its layout under `group`, `statuses` and `fields`. */
export interface Spec {
  kind: Collection
  look: Look
  /** "status", "year", "none" or the property to group by (fallbacks joined by `|`). */
  group: string
  statuses: { key: string; label: string; spellings: string[] }[]
  /** Properties shown under the title of each note, joined; each entry may list fallbacks with `|`. */
  fields: string[]
}

const PRESETS: Record<Collection, { look: Look; group: string; fields: string[] }> = {
  projects: { look: "cards", group: "status", fields: [] },
  books: { look: "shelf", group: "status", fields: ["author|authors", "year|published"] },
  movies: { look: "shelf", group: "status", fields: ["director|directors", "released|year"] },
  talks: { look: "rows", group: "year", fields: ["event|venue"] },
  recipes: { look: "cards", group: "category|course", fields: [] },
  places: { look: "cards", group: "country", fields: ["city|region"] },
  shelf: { look: "shelf", group: "status", fields: ["author|creator"] },
}

const normalize = (v: string) => v.trim().toLowerCase().replace(/[\s_]+/g, "-")

/** A value written once or per language. */
const localized = (v: unknown, lang: Lang): string =>
  v && typeof v === "object" && !Array.isArray(v) ? plain((v as Record<string, unknown>)[lang] ?? Object.values(v)[0]) : plain(v)

export function specOf(note: Note, kind: Collection): Spec {
  const fm = note.source.fm
  const preset = PRESETS[kind]
  const s = t(note.lang)
  // `statuses: { playing: Playing, backlog: { vi-VN: Sẽ chơi, en-US: Backlog } }`, in reading order.
  const own = fm.statuses && typeof fm.statuses === "object" && !Array.isArray(fm.statuses) ? (fm.statuses as Record<string, unknown>) : undefined
  const statuses = own
    ? Object.entries(own).map(([key, label]) => ({ key: normalize(key), label: localized(label, note.lang) || key, spellings: [normalize(key)] }))
    : (STATUSES[kind] ?? []).map(([key, label, spellings]) => ({ key, label: s[label], spellings }))
  const fields = Array.isArray(fm.fields) ? fm.fields.map(String) : typeof fm.fields === "string" ? [fm.fields] : preset.fields
  return { kind, look: preset.look, group: typeof fm.group === "string" && fm.group ? fm.group : preset.group, statuses, fields }
}

/** Plain text of a frontmatter value: a wikilink gives its alias or its name. */
export function plain(v: unknown): string {
  if (v == null) return ""
  if (Array.isArray(v)) return v.map(plain).filter(Boolean).join(", ")
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === "object") return ""
  return String(v)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target.split("/").pop()!)
    .trim()
}

/** The first of `a|b|c` a note has a value for. */
export function field(n: Note, names: string): string {
  for (const name of names.split("|")) {
    const v = plain(n.source.fm[name.trim()])
    if (v) return v
  }
  return ""
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

/** When something in a collection happened: its end, else its date or start. */
export function whenOf(n: Note): Date | undefined {
  const fm = n.source.fm
  for (const v of [fm.end, fm.finished, fm.watched, fm.visited, fm.date, fm.start, fm.started]) {
    if (v == null || v === "") continue
    const d = new Date(/^\d{4}$/.test(String(v)) ? `${v}-01-01` : String(v))
    if (!Number.isNaN(d.getTime())) return d
  }
  return n.created
}

// ---------- bases ----------

/** A base a note shows: an embedded file (and view), or a ```base block, in the order they appear. */
export interface BaseRef {
  base: BaseFile
  view?: string
}

const BASE_REF = /<span class="base-ph" data-rel="([^"]*)" data-view="([^"]*)"><\/span>|^```base[^\n]*\n([\s\S]*?)^```/gm
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

export function basesOf(note: Note): BaseRef[] {
  const out: BaseRef[] = []
  for (const m of note.md.matchAll(BASE_REF)) {
    try {
      if (m[3] !== undefined) out.push({ base: parseBase(m[3]) })
      else {
        const doc = getVault().docs.get(unescape(m[1]))
        if (doc) out.push({ base: parseBase(doc.src), view: unescape(m[2]) || undefined })
      }
    } catch {
      // A malformed base shows its own error where it is embedded.
    }
  }
  return out
}

interface BaseResult {
  notes: Note[]
  /** The base's own groups, when its view has a groupBy. */
  groups?: { value: unknown; notes: Note[] }[]
  /** Whether the base sorted its rows, so the collection keeps their order. */
  sorted: boolean
}

/** The published notes a base finds, as seen from `note` (its `this`). */
export function runBase(note: Note, ref: BaseRef): BaseResult {
  const view = ref.base.views.find((v) => v.name === ref.view) ?? ref.base.views[0]
  if (!view) return { notes: [], sorted: false }
  const all = engineFor(note.lang)
  const res = runView(ref.base, view, { ...all, current: all.pages.find((p) => p.key === note.key) })
  const byKey = getVault().byKey[note.lang]
  const notesOf = (rows: { page: { key: string } }[]) =>
    rows.map((r) => byKey.get(r.page.key)).filter((n): n is Note => !!n && n.key !== note.key && !n.protected)
  return {
    notes: notesOf(res.rows),
    groups: res.groups?.map((g) => ({ value: g.key, notes: notesOf(g.rows) })).filter((g) => g.notes.length),
    sorted: view.sort.length > 0,
  }
}

/** Each rendered base of a note, in order, replaced by what `by` makes of it. */
function replaceBases(html: string, by: (i: number) => string): string {
  let out = ""
  let at = 0
  let i = 0
  const open = /<div class="base-embed[^"]*">/g
  for (let m = open.exec(html); m; m = open.exec(html)) {
    // The end of this div: count the divs opened and closed inside it.
    const tags = /<div\b|<\/div>/g
    tags.lastIndex = m.index + m[0].length
    let depth = 1
    let end = html.length
    for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
      depth += tag[0] === "</div>" ? -1 : 1
      if (!depth) {
        end = tag.index + tag[0].length
        break
      }
    }
    out += html.slice(at, m.index) + by(i++)
    at = end
    open.lastIndex = end
  }
  return out + html.slice(at)
}

/** The rendered note without the bases it embeds: a collection shows what they find instead. */
export function withoutBases(html: string): string {
  return replaceBases(html, () => "")
}

// ---------- collections ----------

export interface CollectionGroup {
  /** What every note of the group shares; "" for notes without it. */
  key: string
  label: string
  notes: Note[]
}

/** The notes of a collection: what its base finds, else its folders and tags. */
function notesOf(note: Note): BaseResult {
  const [ref] = basesOf(note)
  if (ref) return runBase(note, ref)
  const { folders, tags } = sourcesOf(note)
  const inFolder = (n: Note) => folders.some((f) => f === "" || n.dir === f || n.dir.startsWith(f + "/"))
  const tagged = (n: Note) => n.tags.some((tag) => tags.some((x) => tag === x || tag.startsWith(x + "/")))
  const notes = listed(note.lang).filter(
    (n) => n.key !== note.key && !n.isHome && !n.protected && !isCollection(n.layout) && (inFolder(n) || tagged(n)),
  )
  return { notes, sorted: false }
}

/** The notes a collection page lists, grouped in reading order. */
export function collectionOf(note: Note, spec: Spec): CollectionGroup[] {
  const s = t(note.lang)
  const found = notesOf(note)
  const collator = new Intl.Collator(note.lang, { numeric: true })
  const statusOf = (value: string) => spec.statuses.find((st) => st.spellings.includes(normalize(value)))
  // The base's own groups win: it was asked for them.
  if (found.groups) {
    return found.groups.map((g) => {
      const value = plain(g.value)
      const status = value ? statusOf(value) : undefined
      return { key: status?.key ?? normalize(value), label: status?.label ?? (value || s.statusOther), notes: g.notes }
    })
  }
  const newest = (a: Note, b: Note) => (whenOf(b)?.getTime() ?? 0) - (whenOf(a)?.getTime() ?? 0) || collator.compare(a.title, b.title)
  const notes = found.sorted ? found.notes : [...found.notes].sort(newest)
  if (spec.group === "none") return notes.length ? [{ key: "", label: "", notes }] : []
  const groups = new Map<string, CollectionGroup>()
  for (const n of notes) {
    let key: string
    let label: string
    if (spec.group === "year") {
      const when = whenOf(n)
      key = label = when ? String(when.getUTCFullYear()) : ""
    } else {
      const value = field(n, spec.group)
      const status = spec.group === "status" && value ? statusOf(value) : undefined
      key = status?.key ?? normalize(value)
      label = status?.label ?? value
    }
    if (!groups.has(key)) groups.set(key, { key, label: label || s.statusOther, notes: [] })
    groups.get(key)!.notes.push(n)
  }
  const rank = (key: string) => {
    const i = spec.statuses.findIndex((st) => st.key === key)
    return i >= 0 ? i : spec.statuses.length
  }
  return [...groups.values()].sort((a, b) => {
    // Notes without the property come last; years go newest first; statuses in their order; anything else by name.
    if (!a.key || !b.key) return a.key ? -1 : b.key ? 1 : 0
    if (spec.group === "year") return Number(b.key) - Number(a.key)
    return rank(a.key) - rank(b.key) || collator.compare(a.label, b.label)
  })
}

/** Places of a collection with a location, for its map. */
export function placesOf(groups: CollectionGroup[]): Place[] {
  const out: Place[] = []
  for (const n of groups.flatMap((g) => g.notes)) {
    const loc = parseLocation(n.source.fm.location ?? n.source.fm.coordinates)
    if (loc) out.push({ lat: loc[0], lng: loc[1], title: n.title, url: n.url, description: n.description })
  }
  return out
}

const memberships = new Map<string, Map<string, Collection>>()

/**
 * The kind of collection a note is listed in, if any: its page then shows it
 * as an item of that kind, with its cover beside its title.
 */
export function collectionKindOf(n: Note): Collection | undefined {
  const id = `${getVault().version}:${n.lang}`
  let map = memberships.get(id)
  if (!map) {
    map = new Map()
    for (const c of listed(n.lang)) {
      if (!isCollection(c.layout) || c.protected) continue
      for (const item of notesOf(c).notes) if (!map.has(item.key)) map.set(item.key, c.layout)
    }
    memberships.set(id, map)
  }
  return map.get(n.key)
}

// ---------- what a note of a collection shows ----------

/** "2021 – 2023", "2024 – now": the years a project ran, from `start` and `end`. */
export function periodOf(n: Note, lang: Lang): string | undefined {
  const fm = n.source.fm
  const year = (v: unknown) => {
    if (v == null || v === "") return undefined
    const text = plain(v)
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

/** The status of a note as its collection names it. */
export function statusLabelOf(n: Note, kind: Collection): string | undefined {
  const value = plain(n.source.fm.status)
  if (!value) return undefined
  const known = (STATUSES[kind] ?? []).find(([, , spellings]) => spellings.includes(normalize(value)))
  return known ? t(n.lang)[known[1]] : value
}

/** Links of a note: a talk's `slides`, `video` and `paper`, then `repo`, `url`, `demo` and every URL in `links`. */
export function linksOf(n: Note): { label: string; href: string }[] {
  const fm = n.source.fm
  const s = t(n.lang)
  const out: { label: string; href: string }[] = []
  const add = (label: string, v: unknown) => {
    for (const x of Array.isArray(v) ? v : [v]) {
      const href = typeof x === "string" ? x.trim() : ""
      if (/^https?:\/\//.test(href)) out.push({ label: label || new URL(href).hostname.replace(/^www\./, ""), href })
    }
  }
  add(s.linkSlides, fm.slides)
  add(s.linkVideo, fm.video)
  add(s.linkPaper, fm.paper)
  add("", fm.repo)
  add("", fm.url)
  add("", fm.demo)
  const links = fm.links
  if (links && typeof links === "object" && !Array.isArray(links)) {
    for (const [label, v] of Object.entries(links as Record<string, unknown>)) add(label, v)
  } else add("", links)
  return out.filter((l, i) => out.findIndex((o) => o.href === l.href) === i)
}

/** A recipe's facts: how long it takes and how many it feeds. */
export function recipeFacts(n: Note): string[] {
  const time = field(n, "time|total_time|duration")
  const servings = field(n, "servings|serves|yield")
  return [time && `⏱ ${time}`, servings && `🍽 ${servings}`].filter(Boolean)
}

/** What the head of a note's own page shows when it is an item of a collection, or has a cover. */
export interface Item {
  kind?: Collection
  /** Covers of books, films and shelves stand upright; the others lie wide. */
  upright: boolean
  byline: string[]
  rating?: number
  status?: string
  links: { label: string; href: string }[]
}

export function itemOf(n: Note): Item | undefined {
  if (n.layout || n.protected) return undefined
  const kind = collectionKindOf(n)
  if (!kind && !n.source.fm.cover) return undefined
  const preset = kind ? PRESETS[kind] : PRESETS.shelf
  const when = whenOf(n)
  const byline =
    kind === "projects"
      ? [periodOf(n, n.lang), plain(n.source.fm.role)]
      : kind === "recipes"
        ? recipeFacts(n)
        : kind === "talks"
          ? [n.source.fm.date != null && when ? formatDate(when, n.lang) : "", ...preset.fields.map((f) => field(n, f))]
          : kind === "places"
            ? [field(n, "city|region"), field(n, "country"), n.source.fm.visited != null && when ? formatDate(when, n.lang) : ""]
            : (kind ? preset.fields : ["author|authors|director|creator", "year|published|released"]).map((f) => field(n, f))
  return {
    kind,
    upright: preset.look === "shelf",
    byline: byline.filter((x): x is string => !!x),
    rating: ratingOf(n),
    status: kind ? statusLabelOf(n, kind) : plain(n.source.fm.status) || undefined,
    links: linksOf(n),
  }
}

// ---------- layouts of a note's own text ----------

const IMAGE_ONLY = /^(?:\s|<br\s*\/?>|<span class="image-embed">\s*<img\b[^>]*>\s*<\/span>|<img\b[^>]*>)+$/
const IMG = /<img\b[^>]*>/g
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

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

/** A gallery of the notes a base finds: each cover, captioned by its note. */
function galleryOfNotes(notes: Note[]): string {
  const items = notes
    .filter((n) => n.cover)
    .map(
      (n) =>
        `<figure class="gallery-item"><a class="internal" href="${esc(n.url)}" data-key="${esc(n.key)}"><img src="${esc(n.cover!)}" alt="" loading="lazy"></a><figcaption><a class="internal" href="${esc(n.url)}">${esc(n.title)}</a></figcaption></figure>`,
    )
  return items.length ? `<div class="gallery-grid">${items.join("")}</div>` : ""
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

/** A timeline of the notes a base finds, each at its date, oldest first as a life is told. */
function timelineOfNotes(notes: Note[], lang: Lang, sorted: boolean): string {
  const dated = notes.map((n) => ({ n, when: whenOf(n) })).filter((x) => x.when)
  if (!sorted) dated.sort((a, b) => a.when!.getTime() - b.when!.getTime())
  if (!dated.length) return ""
  const events = dated.map(
    ({ n, when }) =>
      `<li class="life-event"><p class="life-when"><time datetime="${when!.toISOString()}">${esc(formatDate(when, lang))}</time></p><div class="life-body"><p><a class="internal" href="${esc(n.url)}" data-key="${esc(n.key)}">${esc(n.title)}</a>${n.description ? ` — ${esc(n.description)}` : ""}</p></div></li>`,
  )
  return `<ol class="life-timeline">${events.join("")}</ol>`
}

/** Lists none of whose items nest another list, each item tested by `starts`, given `cls`. */
function classifyLists(html: string, starts: RegExp, cls: string): string {
  return html.replace(/<ul>([\s\S]*?)<\/ul>/g, (list, inner: string) => {
    if (inner.includes("<ul") || inner.includes("<ol")) return list
    const items = inner.match(/<li>[\s\S]*?<\/li>/g) ?? []
    return items.length && items.every((li) => starts.test(li)) ? `<ul class="${cls}">${inner}</ul>` : list
  })
}

/**
 * A page of links: every list whose items each start with a link becomes a
 * column of buttons; the words after a link describe it.
 */
export function linksHtml(html: string): string {
  return classifyLists(html, /^<li>\s*<a\s/, "link-hub")
}

/**
 * What I use: every list whose items each start with a name in bold (or a
 * link) becomes a grid of cards, the name over what follows it.
 */
export function usesHtml(html: string): string {
  return classifyLists(html, /^<li>\s*(<strong>|<a\s)/, "uses-grid")
}

/** Questions and answers: each H2 a question that opens on its answer. */
export function faqHtml(html: string): string {
  const { intro, parts } = sections(html)
  return (
    intro +
    parts
      .map((p) => {
        const question = p.heading.replace(/<a class="heading-anchor"[\s\S]*?<\/a>/, "")
        return `<details class="faq-item"><summary>${question}</summary><div class="faq-answer">${p.body}</div></details>`
      })
      .join("")
  )
}

/**
 * A wall of quotes: runs of quotes become one wall of cards; a last line
 * starting with a dash is who said it.
 */
export function quotesHtml(html: string): string {
  const out: string[] = []
  let wall: string[] = []
  const flush = () => {
    if (wall.length) out.push(`<div class="quote-wall">${wall.join("")}</div>`)
    wall = []
  }
  for (const part of html.split(/(<blockquote>[\s\S]*?<\/blockquote>)/)) {
    const inner = part.match(/^<blockquote>([\s\S]*)<\/blockquote>$/)?.[1]
    if (inner !== undefined) {
      // "— Name" as the last paragraph, or as the last line of the only one.
      const own = inner.match(/<p>\s*(?:—|–|--)\s*([^<]*?)\s*<\/p>\s*$/)
      const line = own ? null : inner.match(/(?:<br>)?\n\s*(?:—|–|--)\s*([^<\n]*?)\s*<\/p>\s*$/)
      const text = own ? inner.slice(0, own.index) : line ? inner.slice(0, line.index) + "</p>" : inner
      const who = own?.[1] ?? line?.[1]
      wall.push(`<figure class="quote-card"><blockquote>${text.trim()}</blockquote>${who ? `<figcaption>${who}</figcaption>` : ""}</figure>`)
    } else if (part.trim() || !wall.length) {
      flush()
      out.push(part)
    }
  }
  flush()
  return out.join("")
}

/** A recipe: its ingredients (a section named so) beside its steps, each ingredient to tick off. */
export function recipeHtml(html: string): string {
  const { intro, parts } = sections(html)
  const at = parts.findIndex((p) => /ingredient|nguyên liệu|thành phần|zutaten|ingrédients|ingredientes/i.test(p.heading))
  if (at < 0) return html
  const ingredients = parts[at]
  const ticks = ingredients.body.replace(/<li>([\s\S]*?)<\/li>/g, '<li><label class="recipe-tick"><input type="checkbox"> $1</label></li>')
  const rest = parts.filter((_, i) => i !== at).map((p) => p.heading + p.body)
  return `${intro}<div class="recipe"><aside class="recipe-ingredients">${ingredients.heading}${ticks}</aside><div class="recipe-steps">${rest.join("")}</div></div>`
}

/** A note's rendered text reshaped by its layout; a recipe of a collection gets its two columns. */
export function layoutHtml(note: Note, html: string): string {
  switch (note.layout) {
    case "cv":
      return cvHtml(html)
    case "gallery": {
      // The covers of the notes a base finds join the note's own pictures.
      const bases = basesOf(note)
      return galleryHtml(replaceBases(html, (i) => (bases[i] ? galleryOfNotes(runBase(note, bases[i]).notes) : "")))
    }
    case "timeline": {
      const bases = basesOf(note)
      return timelineHtml(
        replaceBases(html, (i) => {
          if (!bases[i]) return ""
          const r = runBase(note, bases[i])
          return timelineOfNotes(r.notes, note.lang, r.sorted)
        }),
      )
    }
    case "links":
      return linksHtml(html)
    case "uses":
      return usesHtml(html)
    case "faq":
      return faqHtml(html)
    case "quotes":
      return quotesHtml(html)
    case undefined:
      return collectionKindOf(note) === "recipes" ? recipeHtml(html) : html
    default:
      // A collection lists what its base finds itself.
      return isCollection(note.layout) ? withoutBases(html) : html
  }
}
