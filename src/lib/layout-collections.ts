import type { Lang } from "../site.config"
import { getVault, listed, type Layout, type Note } from "./vault"
import { slugTag } from "./slug"
import { t, type StringKey } from "./i18n"
import { currentPage, engineFor } from "./dataview-render"
import { parseBase, runView, type BaseFile } from "./bases"
import { parseLocation, type Place } from "./places"
import { journal, type Day } from "./journal"
import { dayKey } from "./calendar"

export type Collection =
  | "projects"
  | "books"
  | "movies"
  | "talks"
  | "recipes"
  | "places"
  | "shelf"
  | "daily"
  | "bookmarks"
  | "people"
  | "snippets"
  | "episodes"
  | "courses"
  | "wishlist"
  | "quotebook"
  | "questions"
  | "digest"
const COLLECTIONS: Collection[] = [
  "projects",
  "books",
  "movies",
  "talks",
  "recipes",
  "places",
  "shelf",
  "daily",
  "bookmarks",
  "people",
  "snippets",
  "episodes",
  "courses",
  "wishlist",
  "quotebook",
  "questions",
  "digest",
]

export const isCollection = (layout: Layout | undefined): layout is Collection => COLLECTIONS.includes(layout as Collection)

type StatusLabel = Extract<StringKey, `status${string}`>

/** Statuses in reading order, each with the spellings that mean it. */
export const STATUSES: Partial<Record<Collection, [key: string, label: StatusLabel, spellings: string[]][]>> = {
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
  bookmarks: [
    ["unread", "statusUnread", ["unread", "to-read", "inbox", "new", "later", "read-later", "queued"]],
    ["read", "statusRead", ["read", "done", "finished", "seen"]],
    ["archived", "statusArchived", ["archived", "archive"]],
  ],
  courses: [
    ["in-progress", "statusActive", ["in-progress", "active", "ongoing", "current", "doing", "taking", "enrolled", "started", "wip"]],
    ["planned", "statusPlanned", ["planned", "to-do", "todo", "want", "next", "idea", "wishlist"]],
    ["completed", "statusCompleted", ["completed", "done", "finished", "passed", "certified", "graduated"]],
    ["dropped", "statusDropped", ["dropped", "abandoned", "quit", "withdrawn", "paused"]],
  ],
  wishlist: [
    ["wanted", "statusWanted", ["wanted", "want", "wish", "to-buy", "todo", "planned", "saving"]],
    ["bought", "statusBought", ["bought", "got", "purchased", "owned", "have", "done"]],
    ["gifted", "statusGifted", ["gifted", "gift", "received", "given"]],
    ["dropped", "statusDropped", ["dropped", "skipped", "abandoned", "cancelled", "canceled", "no-longer-wanted"]],
  ],
  questions: [
    ["open", "statusOpen", ["open", "unanswered", "pending", "todo", "new", "asked"]],
    ["answered", "statusAnswered", ["answered", "resolved", "solved", "closed", "done"]],
  ],
}

/**
 * How a collection looks: cards, a shelf of covers, a list of dated rows, or
 * the page of its own kind (a journal, a reading list, faces, code, episodes,
 * courses, a wishlist, quotes, questions, a digest of the weeks).
 */
export type Look =
  | "cards"
  | "shelf"
  | "rows"
  | "daily"
  | "bookmarks"
  | "people"
  | "snippets"
  | "episodes"
  | "courses"
  | "wishlist"
  | "quotebook"
  | "questions"
  | "digest"

/** A collection as its note sets it up: the preset of its layout under `group`, `statuses` and `fields`. */
export interface Spec {
  kind: Collection
  look: Look
  /** "status", "year", "month", "none" or the property to group by (fallbacks joined by `|`). */
  group: string
  statuses: { key: string; label: string; spellings: string[] }[]
  /** Properties shown under the title of each note, joined; each entry may list fallbacks with `|`. */
  fields: string[]
}

/** `groups`: the groupings a kind takes, when not the usual status, year, month and none. */
export const PRESETS: Record<Collection, { look: Look; group: string; fields: string[]; groups?: string[] }> = {
  projects: { look: "cards", group: "status", fields: [] },
  books: { look: "shelf", group: "status", fields: ["author|authors", "year|published"] },
  movies: { look: "shelf", group: "status", fields: ["director|directors", "released|year"] },
  talks: { look: "rows", group: "year", fields: ["event|venue"] },
  recipes: { look: "cards", group: "category|course", fields: [] },
  places: { look: "cards", group: "country", fields: ["city|region"] },
  shelf: { look: "shelf", group: "status", fields: ["author|creator"] },
  daily: { look: "daily", group: "month", fields: [] },
  bookmarks: { look: "bookmarks", group: "status", fields: ["author|authors|byline"] },
  people: { look: "people", group: "none", fields: ["role|job|position", "org|company|organization|affiliation"] },
  snippets: { look: "snippets", group: "none", fields: [] },
  episodes: { look: "episodes", group: "season|year", fields: ["guests|guest"] },
  courses: { look: "courses", group: "status", fields: ["provider|platform", "instructor|instructors|teacher"] },
  wishlist: { look: "wishlist", group: "status", fields: ["brand|store|shop"] },
  // A quotebook groups its quotes, not its notes: by who said them, or by the note they are in.
  quotebook: { look: "quotebook", group: "author", fields: [], groups: ["author", "source", "none"] },
  questions: { look: "questions", group: "status", fields: [] },
  // A digest is by week, whatever its note says.
  digest: { look: "digest", group: "week", fields: [], groups: [] },
}

/** What a collection groups by when its note says nothing: `status` for books, `year` for talks… */
export const presetGroup = (kind: Collection): string => PRESETS[kind].group

/** The groupings a kind of collection takes; undefined for the usual ones. */
export const presetGroups = (kind: Collection): string[] | undefined => PRESETS[kind].groups

export const normalize = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")

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

/**
 * Where a collection takes its notes from: `from` (folders and #tags), else
 * the note's own folder; questions are the notes tagged #question, and a
 * digest is of the whole garden.
 */
export function sourcesOf(note: Note): { folders: string[]; tags: string[] } {
  const raw = note.source.fm.from
  const list = (Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw]).map((x) => plain(x))
  const folders: string[] = []
  const tags: string[] = []
  for (const item of list) {
    if (item.startsWith("#")) tags.push(slugTag(item.slice(1)))
    else folders.push(item.replace(/^\/+|\/+$/g, ""))
  }
  if (!folders.length && !tags.length) {
    if (note.layout === "questions") tags.push("question")
    else folders.push(note.layout === "digest" ? "" : note.dir)
  }
  return { folders, tags }
}

/** A date property as a date: a bare year as its first day; undefined when it is not one. */
export function dateOf(v: unknown): Date | undefined {
  if (v == null || v === "") return undefined
  const d = new Date(/^\d{4}$/.test(String(v)) ? `${v}-01-01` : String(v))
  return Number.isNaN(d.getTime()) ? undefined : d
}

const journalDays = new WeakMap<Day[], Map<string, string>>()

/**
 * The day a note's name gives, as YYYY-MM-DD: the daily note format of the
 * vault (as for /calendar and the links between days), else a name starting
 * with YYYY-MM-DD.
 */
export function nameDay(n: Note): string | undefined {
  const days = journal(n.lang)
  let byKey = journalDays.get(days)
  if (!byKey) journalDays.set(days, (byKey = new Map(days.map((d) => [d.note.key, d.date]))))
  const known = byKey.get(n.key)
  if (known) return known
  const m = n.key
    .split("/")
    .pop()!
    .match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = m && new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // 2024-02-30 is not a day.
  return d && d.getUTCDate() === Number(m[3]) ? d.toISOString().slice(0, 10) : undefined
}

/** The day of a daily note, YYYY-MM-DD: its `date` property, else its name. */
export function noteDay(n: Note): string | undefined {
  const d = dateOf(n.source.fm.date)
  return d ? dayKey(d) : nameDay(n)
}

/** When something in a collection happened: its end, else its date or start, else the day its name gives. */
export function whenOf(n: Note): Date | undefined {
  const fm = n.source.fm
  for (const v of [fm.end, fm.finished, fm.watched, fm.visited, fm.date, fm.start, fm.started]) {
    const d = dateOf(v)
    if (d) return d
  }
  const day = nameDay(n)
  return day ? new Date(`${day}T00:00:00Z`) : n.created
}

/** How much a wish matters: `priority` high, medium or low (or 1, 2, 3…), as written; rank 0 first, unknown last. */
export function priorityOf(n: Note): { rank: number; label: string } {
  const label = plain(n.source.fm.priority)
  const v = normalize(label)
  const known = [
    ["high", "urgent", "must", "must-have", "top", "p1"],
    ["medium", "normal", "mid", "p2"],
    ["low", "someday", "nice-to-have", "p3"],
  ].findIndex((spellings) => spellings.includes(v))
  const rank = known >= 0 ? known : /^\d+$/.test(v) ? Number(v) - 1 : Infinity
  return { rank, label }
}

/** Headings of the section that answers a question, in the languages of the UI. */
const ANSWERS = /^(answers?|trả lời|câu trả lời|lời giải|antworten?|réponses?|respuestas?|回答|答え|答案|解答)$/i

/** A published note to show: not unlisted, not a draft, not protected. */
function visibleNote(lang: Lang, key: string): Note | undefined {
  const n = getVault().byKey[lang].get(key)
  return n && !n.unlisted && !n.draft && !n.protected ? n : undefined
}

/** Something a property names: its text, linked to its note when that is published. */
export interface Ref {
  text: string
  href?: string
}

/**
 * Whether a question is answered, and by what: `status: answered` (or
 * resolved…), an `answer` property (a note, a URL or words), or a link to a
 * note in a section named Answers. A note that is unlisted, a draft or
 * protected answers it without being named.
 */
export function questionOf(n: Note): { answered: boolean; answer?: Ref } {
  const fm = n.source.fm
  const vault = getVault()
  let answer: Ref | undefined
  let answered = false
  const raw = Array.isArray(fm.answer) ? fm.answer[0] : fm.answer
  const text = typeof raw === "string" ? raw.trim() : raw == null ? "" : plain(raw)
  const link = text.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/)
  if (link) {
    answered = true
    const s = vault.resolveNote(link[1], n.dir)
    const target = s && visibleNote(n.lang, s.key)
    if (target) answer = { text: link[2] ?? target.title, href: target.url }
  } else if (text) {
    answered = true
    answer = /^https?:\/\//.test(text) ? { text: new URL(text).hostname.replace(/^www\./, ""), href: text } : { text }
  }
  if (!answered) {
    // The links under a heading named Answers, up to the next heading as high.
    const lines = n.md.split("\n")
    const at = lines.findIndex((l) => /^#{1,6}\s/.test(l) && ANSWERS.test(l.replace(/^#+\s*/, "").trim()))
    if (at >= 0) {
      const level = lines[at].match(/^#+/)![0].length
      const end = lines.findIndex((l, i) => i > at && /^#{1,6}\s/.test(l) && l.match(/^#+/)![0].length <= level)
      const body = lines.slice(at + 1, end < 0 ? undefined : end).join("\n")
      for (const m of body.matchAll(/data-key="([^"]*)"/g)) {
        const target = visibleNote(n.lang, unescapeHtml(m[1]))
        if (target && target.key !== n.key) {
          answered = true
          answer = { text: target.title, href: target.url }
          break
        }
      }
    }
  }
  const status = normalize(plain(fm.status))
  if (!answered) answered = STATUSES.questions![1][2].includes(status)
  return { answered, answer }
}

// ---------- bases ----------

/** A base a note shows: an embedded file (and view), or a ```base block, in the order they appear. */
export interface BaseRef {
  base: BaseFile
  view?: string
}

const BASE_REF = /<span class="base-ph" data-rel="([^"]*)" data-view="([^"]*)"><\/span>|^```base[^\n]*\n([\s\S]*?)^```/gm
export const unescapeHtml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")

export function basesOf(note: Note): BaseRef[] {
  const out: BaseRef[] = []
  for (const m of note.md.matchAll(BASE_REF)) {
    try {
      if (m[3] !== undefined) out.push({ base: parseBase(m[3]) })
      else {
        const doc = getVault().docs.get(unescapeHtml(m[1]))
        if (doc) out.push({ base: parseBase(doc.src), view: unescapeHtml(m[2]) || undefined })
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
  const res = runView(ref.base, view, { ...all, current: currentPage(all, note.key) })
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
export function replaceBases(html: string, by: (i: number) => string): string {
  return replaceDivs(html, /<div class="base-embed[^"]*">/g, by)
}

/** Each div that `open` matches the opening tag of, whole, in order, replaced by what `by` makes of it. */
export function replaceDivs(html: string, open: RegExp, by: (i: number) => string): string {
  let out = ""
  let at = 0
  let i = 0
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
  const notes = listed(note.lang).filter((n) => n.key !== note.key && !n.isHome && !n.protected && !isCollection(n.layout) && (inFolder(n) || tagged(n)))
  return { notes, sorted: false }
}

/** The number of an episode, 0 without one. */
export const episodeNumber = (n: Note) => Number.parseFloat(field(n, "number|episode|ep")) || 0

/**
 * What a note is grouped under: the first of `a|b|c` it has, `year` and
 * `month` read from its date. Dated and numbered groups carry an `order`, to
 * go newest first.
 */
function groupOf(n: Note, spec: Spec, statusOf: (value: string) => Spec["statuses"][number] | undefined, lang: Lang) {
  for (const name of spec.group.split("|").map((x) => x.trim())) {
    if (name === "year" || name === "month") {
      const when = whenOf(n)
      if (!when) continue
      const year = when.getUTCFullYear()
      if (name === "year") return { key: String(year), label: String(year), order: year }
      const month = when.getUTCMonth()
      const label = when.toLocaleDateString(lang, { month: "long", year: "numeric", timeZone: "UTC" })
      return { key: `${year}-${String(month + 1).padStart(2, "0")}`, label, order: year * 12 + month }
    }
    // A question is answered by its status, its `answer` or a link under Answers; open ones come first.
    if (name === "status" && spec.kind === "questions") {
      const answered = questionOf(n).answered
      const key = answered ? "answered" : "open"
      return { key, label: statusOf(key)?.label ?? t(lang)[answered ? "statusAnswered" : "statusOpen"], order: answered ? 0 : 1 }
    }
    const value = field(n, name)
    if (!value) continue
    const status = name === "status" ? statusOf(value) : undefined
    if (status) return { key: status.key, label: status.label }
    // Season 2 of a podcast, after season 3.
    if (name === "season" && /^\d+$/.test(value)) return { key: value, label: t(lang).season.replace("{n}", value), order: Number(value) }
    return { key: normalize(value), label: value }
  }
  return { key: "", label: "" }
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
  // People go by name, episodes by number, wishes by priority, questions oldest first, everything else newest first.
  const order =
    spec.kind === "people"
      ? (a: Note, b: Note) => collator.compare(a.title, b.title)
      : spec.kind === "episodes"
        ? (a: Note, b: Note) => episodeNumber(b) - episodeNumber(a) || newest(a, b)
        : spec.kind === "wishlist"
          ? (a: Note, b: Note) => priorityOf(a).rank - priorityOf(b).rank || newest(a, b)
          : spec.kind === "questions"
            ? (a: Note, b: Note) => -newest(a, b)
            : newest
  const notes = found.sorted ? found.notes : [...found.notes].sort(order)
  if (spec.group === "none") return notes.length ? [{ key: "", label: "", notes }] : []
  const groups = new Map<string, CollectionGroup & { order?: number }>()
  for (const n of notes) {
    const { key, label, order } = groupOf(n, spec, statusOf, note.lang)
    if (!groups.has(key)) groups.set(key, { key, label: label || s.statusOther, notes: [], order })
    groups.get(key)!.notes.push(n)
  }
  const rank = (key: string) => {
    const i = spec.statuses.findIndex((st) => st.key === key)
    return i >= 0 ? i : spec.statuses.length
  }
  return [...groups.values()]
    .sort((a, b) => {
      // Notes without the property come last; years, months and seasons go newest first; statuses in their order; anything else by name.
      if (!a.key || !b.key) return a.key ? -1 : b.key ? 1 : 0
      if (a.order !== undefined || b.order !== undefined) return (b.order ?? -Infinity) - (a.order ?? -Infinity)
      return rank(a.key) - rank(b.key) || collator.compare(a.label, b.label)
    })
    .map(({ key, label, notes }) => ({ key, label, notes }))
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
      // A quotebook and a digest gather passages and weeks of their notes: the notes stay as they are.
      if (!isCollection(c.layout) || c.protected || c.layout === "quotebook" || c.layout === "digest") continue
      for (const item of notesOf(c).notes) if (!map.has(item.key)) map.set(item.key, c.layout)
    }
    memberships.set(id, map)
  }
  return map.get(n.key)
}
