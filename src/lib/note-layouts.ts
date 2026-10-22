import { site, type Lang } from "../site.config"
import { getVault, listed, type Layout, type Note } from "./vault"
import { slugTag } from "./slug"
import { formatDate, langMeta, t, type StringKey } from "./i18n"
import { currentPage, engineFor } from "./dataview-render"
import { parseBase, runView, type BaseFile } from "./bases"
import { parseLocation, type Place } from "./places"
import { escapeAttr } from "./html"
import { journal, type Day } from "./journal"
import { dayKey } from "./calendar"
import { toProp } from "./properties"
import { allSeries } from "./series"
import { glossary } from "./glossary"
import { formatReference, people, toBibtex, type BibEntry } from "./citations"
import { absUrl } from "./base"

/**
 * Page layouts a note asks for with its `layout` property. Some reshape the
 * note's own text (a résumé, a gallery, a timeline, links, uses, a FAQ,
 * quotes, a paper, a decision record, a changelog, a dialogue, reading
 * highlights, a glossary, a trip, a syllabus, a poem, a letter, a comparison,
 * a checklist, a recipe card, a hub, lore); collections list other notes,
 * grouped by status, year or any property. A collection whose note embeds a base lists what the base finds,
 * in its order and groups.
 */

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
const PRESETS: Record<Collection, { look: Look; group: string; fields: string[]; groups?: string[] }> = {
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
function dateOf(v: unknown): Date | undefined {
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
  const m = n.key.split("/").pop()!.match(/^(\d{4})-(\d{2})-(\d{2})/)
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
const unescapeHtml = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

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
function replaceBases(html: string, by: (i: number) => string): string {
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
  const notes = listed(note.lang).filter(
    (n) => n.key !== note.key && !n.isHome && !n.protected && !isCollection(n.layout) && (inFolder(n) || tagged(n)),
  )
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

/** A rating out of `scale`, from a number or a run of stars. */
export function parseRating(v: unknown, scale: number): number | undefined {
  if (v == null || v === "") return undefined
  const r = typeof v === "number" ? v : /^[★⭐]+$/u.test(String(v)) ? [...String(v)].length : Number(v)
  return Number.isFinite(r) && r > 0 ? Math.min(scale, r) : undefined
}

/** A note's rating out of conventions.ratingScale. */
export function ratingOf(n: Note): number | undefined {
  return parseRating(n.source.fm.rating, site.conventions.ratingScale)
}

/** The status of a note as its collection names it. */
export function statusLabelOf(n: Note, kind: Collection): string | undefined {
  const value = plain(n.source.fm.status)
  if (!value) return undefined
  const known = (STATUSES[kind] ?? []).find(([, , spellings]) => spellings.includes(normalize(value)))
  return known ? t(n.lang)[known[1]] : value
}

/** Links of a note: a talk's `slides`, `video` and `paper`, then `source`, `repo`, `url`, `website`, `demo` and every URL in `links`. */
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
  add("", fm.source)
  add("", fm.repo)
  add("", fm.url)
  add("", fm.website)
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

/** How far into a course: `progress` as 0–100, "45%" or "3/10", capped at 100. */
export function progressOf(n: Note): { percent: number; label: string } | undefined {
  const text = plain(n.source.fm.progress)
  const part = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (part && Number(part[2]) > 0) return { percent: Math.min(100, (Number(part[1]) / Number(part[2])) * 100), label: `${part[1]}/${part[2]}` }
  const pct = text.match(/^(\d+(?:\.\d+)?)\s*%?$/)
  if (!pct) return undefined
  const percent = Math.min(100, Number(pct[1]))
  return { percent, label: `${+percent.toFixed(1)}%` }
}

/** Currencies a price may be written with instead of a `currency`. */
const CURRENCY_SIGNS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₫": "VND", "₩": "KRW", "₹": "INR" }

/**
 * The price of a wish: `price` as a number or as written ("1,299.50",
 * "1.299,50", "$12"), in `currency` (an ISO code), else the sign it is written with.
 */
export function priceOf(n: Note): { amount: number; currency?: string } | undefined {
  const v = n.source.fm.price
  const text = typeof v === "number" ? String(v) : plain(v)
  const digits = text.match(/\d[\d.,\s]*/)?.[0].replace(/\s+/g, "").replace(/[.,]$/, "")
  if (!digits) return undefined
  // The last of a dot or a comma followed by one or two digits is the decimal point; the others group thousands.
  const decimal = digits.match(/[.,](\d{1,2})$/)
  const whole = (decimal ? digits.slice(0, -decimal[0].length) : digits).replace(/[.,]/g, "")
  const amount = Number(decimal ? `${whole}.${decimal[1]}` : whole)
  const sign = Object.keys(CURRENCY_SIGNS).find((c) => text.includes(c))
  const currency = plain(n.source.fm.currency).toUpperCase() || (sign && CURRENCY_SIGNS[sign]) || undefined
  return { amount, currency }
}

/** An amount in a language's way, with its currency when it has one; a code Intl does not know is written after it. */
export function formatPrice(amount: number, currency: string | undefined, lang: Lang): string {
  try {
    return new Intl.NumberFormat(lang, currency ? { style: "currency", currency } : { maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toLocaleString(lang)} ${currency}`
  }
}

/** What the head of a note's own page shows when it is an item of a collection, or has a cover. */
export interface Item {
  kind?: Collection
  /** Covers of books, films and shelves stand upright; the others lie wide. */
  upright: boolean
  /** A person's picture is round. */
  round?: boolean
  /** Sound of an episode, played at its head. */
  audio?: string
  byline: string[]
  rating?: number
  status?: string
  /** How far into a course. */
  progress?: { percent: number; label: string }
  /** What answers a question. */
  answer?: Ref
  links: { label: string; href: string }[]
}

/** What a note of a collection is, under its title: its author and year, a project's years, an episode's number… */
function bylineOf(n: Note, kind: Collection | undefined): (string | undefined)[] {
  const preset = kind ? PRESETS[kind] : PRESETS.shelf
  const when = whenOf(n)
  const fm = n.source.fm
  switch (kind) {
    case "projects":
      return [periodOf(n, n.lang), plain(fm.role)]
    case "recipes":
      return recipeFacts(n)
    case "talks":
      return [fm.date != null && when ? formatDate(when, n.lang) : "", ...preset.fields.map((f) => field(n, f))]
    case "places":
      return [field(n, "city|region"), field(n, "country"), fm.visited != null && when ? formatDate(when, n.lang) : ""]
    case "bookmarks": {
      const published = dateOf(fm.published)
      return [field(n, "author|authors|byline"), published ? formatDate(published, n.lang) : ""]
    }
    case "snippets":
      return [field(n, "language")]
    case "episodes":
      return [episodeNumber(n) ? `#${field(n, "number|episode|ep")}` : "", formatDate(when, n.lang), field(n, "duration|length"), field(n, "guests|guest")]
    case "courses":
      return [...preset.fields.map((f) => field(n, f)), periodOf(n, n.lang)]
    case "wishlist": {
      const price = priceOf(n)
      return [price && formatPrice(price.amount, price.currency, n.lang), ...preset.fields.map((f) => field(n, f)), priorityOf(n).label]
    }
    case undefined:
      return ["author|authors|director|creator", "year|published|released"].map((f) => field(n, f))
    default:
      return preset.fields.map((f) => field(n, f))
  }
}

export function itemOf(n: Note): Item | undefined {
  // Reading highlights show the book they come from the same way.
  const highlights = n.layout === "highlights"
  if ((n.layout && !highlights) || n.protected) return undefined
  // A day of a journal keeps the usual page, with its links to the days around it.
  const listedIn = highlights ? undefined : collectionKindOf(n)
  const kind = listedIn === "daily" ? undefined : listedIn
  if (!kind && !n.source.fm.cover && !highlights) return undefined
  const preset = kind ? PRESETS[kind] : PRESETS.shelf
  // Where highlights come from: a URL to link, or a name such as Kindle.
  const source = highlights ? plain(n.source.fm.source) : ""
  const sourceUrl = /^https?:\/\//.test(source)
  const question = kind === "questions" ? questionOf(n) : undefined
  const certificate = kind === "courses" && n.certificate ? [{ label: t(n.lang).certificate, href: n.certificate.href }] : []
  return {
    kind,
    upright: preset.look === "shelf",
    round: kind === "people" || undefined,
    audio: kind === "episodes" ? n.audio?.href : undefined,
    byline: [...bylineOf(n, kind), sourceUrl ? "" : source].filter((x): x is string => !!x),
    rating: ratingOf(n),
    status: question
      ? t(n.lang)[question.answered ? "statusAnswered" : "statusOpen"]
      : kind
        ? statusLabelOf(n, kind)
        : plain(n.source.fm.status) || undefined,
    progress: kind === "courses" ? progressOf(n) : undefined,
    answer: question?.answer,
    links: [...(sourceUrl ? [{ label: new URL(source).hostname.replace(/^www\./, ""), href: source }] : []), ...certificate, ...linksOf(n)].filter(
      (l, i, all) => all.findIndex((o) => o.href === l.href) === i,
    ),
  }
}

// ---------- layouts of a note's own text ----------

const IMAGE_ONLY = /^(?:\s|<br\s*\/?>|<span class="image-embed">\s*<img\b[^>]*>\s*<\/span>|<img\b[^>]*>)+$/
const IMG = /<img\b[^>]*>/g

/**
 * A gallery: runs of paragraphs holding nothing but pictures become one grid,
 * each picture a figure captioned by its alt text. Text and headings stay, so
 * a heading starts an album. `open` is the tag the grid opens with.
 */
export function galleryHtml(html: string, open = '<div class="gallery-grid">'): string {
  const out: string[] = []
  let grid: string[] = []
  const flush = () => {
    if (grid.length) out.push(`${open}${grid.join("")}</div>`)
    grid = []
  }
  for (const part of html.split(/(<p>[\s\S]*?<\/p>)/)) {
    const inner = part.match(/^<p>([\s\S]*)<\/p>$/)?.[1]
    if (inner !== undefined && IMAGE_ONLY.test(inner) && inner.includes("<img")) {
      for (const img of inner.match(IMG)!) {
        const alt = img.match(/\balt="([^"]*)"/)?.[1] ?? ""
        const w = Number(img.match(/\swidth="(\d+(?:\.\d+)?)"/)?.[1])
        const h = Number(img.match(/\sheight="(\d+(?:\.\d+)?)"/)?.[1])
        // The aspect ratio lets the darkroom style justify rows; without it, CSS falls back.
        const ar = w > 0 && h > 0 ? ` style="--ar: ${+(w / h).toFixed(4)}"` : ""
        grid.push(`<figure class="gallery-item"${ar}>${img}${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>`)
      }
    } else if (part.trim() || !grid.length) {
      flush()
      out.push(part)
    }
  }
  flush()
  return out.join("")
}

/** A gallery of the notes a base finds: each cover, captioned by its note; the caption is the one link to tab to. */
function galleryOfNotes(notes: Note[]): string {
  const items = notes
    .filter((n) => n.cover)
    .map(
      (n) =>
        `<figure class="gallery-item"><a class="internal" href="${escapeAttr(n.url)}" data-key="${escapeAttr(n.key)}" tabindex="-1" aria-hidden="true"><img src="${escapeAttr(n.cover!)}" alt="" loading="lazy"></a><figcaption><a class="internal" href="${escapeAttr(n.url)}">${escapeAttr(n.title)}</a></figcaption></figure>`,
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
      `<li class="life-event"><p class="life-when"><time datetime="${when!.toISOString()}">${escapeAttr(formatDate(when, lang))}</time></p><div class="life-body"><p><a class="internal" href="${escapeAttr(n.url)}" data-key="${escapeAttr(n.key)}">${escapeAttr(n.title)}</a>${n.description ? ` — ${escapeAttr(n.description)}` : ""}</p></div></li>`,
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
      const { text, who } = quoteOf(inner)
      wall.push(`<figure class="quote-card"><blockquote>${text}</blockquote>${who ? `<figcaption>${who}</figcaption>` : ""}</figure>`)
    } else if (part.trim() || !wall.length) {
      flush()
      out.push(part)
    }
  }
  flush()
  return out.join("")
}

/** What a quote says and who said it (HTML): "— Name" as the last paragraph, or as the last line of the only one. */
export function quoteOf(inner: string): { text: string; who?: string } {
  const own = inner.match(/<p>\s*(?:—|–|--)\s*([^<]*?)\s*<\/p>\s*$/)
  const line = own ? null : inner.match(/(?:<br>)?\n\s*(?:—|–|--)\s*([^<\n]*?)\s*<\/p>\s*$/)
  const text = own ? inner.slice(0, own.index) : line ? inner.slice(0, line.index) + "</p>" : inner
  return { text: text.trim(), who: (own?.[1] ?? line?.[1]) || undefined }
}

/** A quote found in a note: its text, who said it, and the block id of its blockquote, if it has one. */
export interface FoundQuote {
  text: string
  who: string
  id?: string
}

/**
 * The quotes of a rendered note, as the `quotes` layout reads them: each
 * blockquote whose last line names who said it. Quotes embedded from other
 * notes belong to those, and a locked part is only ciphertext, so neither counts.
 */
export function quotesOf(html: string): FoundQuote[] {
  const own = replaceDivs(html, /<div class="transclude"[^>]*>/g, () => "")
  return topLevel(own, ["blockquote"]).flatMap((b) => {
    if (!b.tag) return []
    const { text, who } = quoteOf(innerOf(b.html))
    const id = b.html.match(/^<blockquote\b[^>]*\sid="([^"]*)"/)?.[1]
    return who ? [{ text, who, id: id && unescapeHtml(id) }] : []
  })
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

// ---------- helpers of the layouts below ----------

const ANCHOR = /<a class="heading-anchor"[\s\S]*?<\/a>/g
/** Text of some HTML: tags and heading anchors dropped, spaces collapsed. */
export const textOf = (html: string) =>
  unescapeHtml(html.replace(ANCHOR, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
/** The id of the heading an HTML part starts with. */
const idOf = (heading: string) => heading.match(/^<h\d[^>]*\sid="([^"]*)"/)?.[1]
/** Minutes it takes to read some words, at the pace of the reading time of notes. */
const minutesOf = (words: number) => Math.max(1, Math.round(words / 220))
const wordsIn = (text: string) => text.match(/\S+/g)?.length ?? 0

/** Something a property names: its text, linked to its note when that is published. */
export interface Ref {
  text: string
  href?: string
}

/**
 * People or notes a property names: a list, or one value split at commas,
 * semicolons and "and" (not inside a wikilink). Wikilinks link to their notes.
 */
export function refsOf(note: Note, v: unknown): Ref[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\s*[;,](?![^[]*\]\])\s*|\s+and\s+/) : v == null ? [] : [v]
  const vault = getVault()
  const resolve = (target: string) => {
    const s = vault.resolveNote(target, note.dir)
    return s && vault.byKey[note.lang].get(s.key)
  }
  return list.flatMap((x) => {
    const p = toProp(x, resolve, (target, alias) => vault.privateLink(target, note.dir, alias, note.lang))
    return p?.kind === "text" ? [{ text: p.text, href: p.href }] : []
  })
}

/** Top-level elements named `tags` in some HTML, and the HTML between them: nested ones count, so each match is whole. */
function topLevel(html: string, tags: string[]): { tag?: string; html: string }[] {
  const out: { tag?: string; html: string }[] = []
  const open = new RegExp(`<(${tags.join("|")})\\b[^>]*>`, "g")
  let at = 0
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const tag = m[1]
    const inner = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g")
    inner.lastIndex = m.index + m[0].length
    let depth = 1
    let end = html.length
    for (let x = inner.exec(html); x; x = inner.exec(html)) {
      depth += x[0].startsWith("</") ? -1 : 1
      if (!depth) {
        end = x.index + x[0].length
        break
      }
    }
    if (m.index > at) out.push({ html: html.slice(at, m.index) })
    out.push({ tag, html: html.slice(m.index, end) })
    at = open.lastIndex = end
  }
  if (at < html.length) out.push({ html: html.slice(at) })
  return out
}

/** What is inside an element's outer HTML. */
const innerOf = (outer: string) => outer.slice(outer.indexOf(">") + 1, outer.lastIndexOf("</"))

// ---------- a paper ----------

/** What the head of a paper shows, and the entry readers cite it by. */
export interface Paper {
  authors: Ref[]
  affiliations: string[]
  /** Where it appeared: a journal or conference, its volume, issue and pages. */
  venue: string
  links: { label: string; href: string }[]
  entry: BibEntry
}

const doiOf = (v: string) => v.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "")
const arxivOf = (v: string) =>
  v
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, "")
    .replace(/^arxiv:\s*/i, "")
    .replace(/\.pdf$/, "")
/** A word for a citation key: plain ASCII letters and digits. */
const keyWord = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

/** Only the fields with a value. */
const filled = (fields: Record<string, string>) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v))

export function paperOf(note: Note): Paper {
  const fm = note.source.fm
  const authors = refsOf(note, fm.authors ?? fm.author)
  const listOf = (v: unknown) => (Array.isArray(v) ? v.map(plain) : [plain(v)]).filter(Boolean)
  const journal = field(note, "journal|venue")
  const booktitle = field(note, "booktitle|conference")
  const volume = field(note, "volume")
  const number = field(note, "issue|number")
  // BibTeX writes a range of pages with two dashes.
  const pages = field(note, "pages").replace(/\s*[-–—]+\s*/g, "--")
  const year = field(note, "year").slice(0, 4) || (note.created ? String(note.created.getUTCFullYear()) : "")
  const doi = doiOf(plain(fm.doi))
  const arxiv = arxivOf(plain(fm.arxiv))
  const first = people(authors[0]?.text)[0]?.family ?? ""
  const word = note.title.split(/\s+/).find((w) => !/^(a|an|the|on|of|in|for|to)$/i.test(w)) ?? ""
  const entry: BibEntry = {
    key: keyWord(first) + year + keyWord(word) || "paper",
    type: journal ? "article" : booktitle ? "inproceedings" : "misc",
    fields: filled({
      author: authors.map((a) => a.text).join(" and "),
      title: note.title,
      journal,
      booktitle: journal ? "" : booktitle,
      year,
      volume,
      number,
      pages,
      publisher: field(note, "publisher"),
      doi,
      eprint: arxiv,
      archiveprefix: arxiv && "arXiv",
      url: site.url ? absUrl(note.url) : "",
    }),
  }
  const container = journal || booktitle
  return {
    authors,
    affiliations: listOf(fm.affiliations ?? fm.affiliation),
    venue: container && `${container}${volume ? ` ${volume}` : ""}${number ? `(${number})` : ""}${pages ? `, ${pages.replace(/--/g, "–")}` : ""}`,
    links: [
      ...(doi ? [{ label: "DOI", href: `https://doi.org/${doi}` }] : []),
      ...(arxiv ? [{ label: "arXiv", href: `https://arxiv.org/abs/${arxiv}` }] : []),
      ...linksOf(note),
    ],
    entry,
  }
}

/** "Cite this": the reference as the bibliography of a note would give it, and its BibTeX to copy. */
export function citeHtml(entry: BibEntry, label: string): string {
  return (
    `<details class="paper-cite"><summary>${escapeAttr(label)}</summary>` +
    `<p class="paper-reference">${formatReference({ ...entry, fields: { ...entry.fields, pages: entry.fields.pages?.replace(/--/g, "–") } })}</p>` +
    `<pre><code class="language-bibtex">${escapeAttr(toBibtex(entry))}</code></pre></details>`
  )
}

const ABSTRACT = /^(abstract|summary|tóm tắt|zusammenfassung|résumé|resumen|要旨|概要|摘要)$/i

/**
 * A paper: its abstract (a section named so, else the text before the first
 * heading) in a box, then the rest of the text, in two columns where the
 * page is wide enough. `cite` goes first.
 */
export function paperHtml(html: string, abstractLabel: string, cite = ""): string {
  const { intro, parts } = sections(html)
  const at = parts.findIndex((p) => ABSTRACT.test(textOf(p.heading)))
  let abstract: string
  let rest: string
  if (at >= 0) {
    abstract = parts[at].heading + parts[at].body
    rest = intro + parts.filter((_, i) => i !== at).map((p) => p.heading + p.body).join("")
  } else {
    // Up to the first heading of any level.
    const cut = intro.search(/<h[3-6][\s>]/)
    const lead = cut < 0 ? intro : intro.slice(0, cut)
    abstract = lead.trim() ? `<h2 class="paper-abstract-title">${escapeAttr(abstractLabel)}</h2>${lead}` : ""
    rest = intro.slice(lead.length) + parts.map((p) => p.heading + p.body).join("")
  }
  return `${cite}${abstract ? `<section class="paper-abstract">${abstract}</section>` : ""}<div class="paper-body">${rest}</div>`
}

// ---------- a decision record ----------

type DecisionLabel = Extract<StringKey, `status${string}`>
const DECISION_STATUSES: [key: string, label: DecisionLabel, spellings: string[]][] = [
  ["proposed", "statusProposed", ["proposed", "draft", "open", "pending", "rfc", "in-review", "under-review"]],
  ["accepted", "statusAccepted", ["accepted", "approved", "adopted", "agreed", "decided"]],
  ["rejected", "statusRejected", ["rejected", "declined", "refused"]],
  ["deprecated", "statusDeprecated", ["deprecated", "obsolete", "retired"]],
  ["superseded", "statusSuperseded", ["superseded", "superceded", "replaced"]],
]

/** What the head of an architecture decision record shows. */
export interface Decision {
  /** A known status keeps its key, so it gets its colour; any other is shown as written. */
  status?: { key: string; label: string }
  deciders: Ref[]
  supersedes: Ref[]
  supersededBy: Ref[]
}

export function decisionOf(note: Note): Decision {
  const fm = note.source.fm
  const s = t(note.lang)
  const supersededBy = refsOf(note, fm["superseded-by"] ?? fm.superseded_by ?? fm.supersededBy)
  const value = plain(fm.status)
  const known = DECISION_STATUSES.find(([, , spellings]) => spellings.includes(normalize(value)))
  // A decision something else replaced is superseded, whatever its status says.
  const status = known
    ? { key: known[0], label: s[known[1]] }
    : value
      ? { key: normalize(value), label: value }
      : supersededBy.length
        ? { key: "superseded", label: s.statusSuperseded }
        : undefined
  return { status, deciders: refsOf(note, fm.deciders), supersedes: refsOf(note, fm.supersedes), supersededBy }
}

const DECISION_PARTS: [cls: string, heading: RegExp][] = [
  ["context", /^(context|background|problem|bối cảnh|ngữ cảnh|vấn đề|kontext|hintergrund|contexte|contexto|背景|コンテキスト)/i],
  ["options", /^(options|considered options|alternatives|phương án|các lựa chọn|lựa chọn|optionen|alternativen|choix|opciones|alternativas|選択肢|选项|方案)/i],
  ["decision", /^(decision|outcome|quyết định|entscheidung|décision|decisión|決定|决定|决策)/i],
  ["consequences", /^(consequences|implications|hệ quả|kết quả|konsequenzen|folgen|conséquences|consecuencias|結果|影響|后果|影响)/i],
]

/** A decision record: its context, options, decision and consequences each a section of its own look. */
export function decisionHtml(html: string): string {
  const { intro, parts } = sections(html)
  return (
    intro +
    parts
      .map((p) => {
        const part = DECISION_PARTS.find(([, re]) => re.test(textOf(p.heading)))
        return part ? `<section class="adr-section adr-${part[0]}">${p.heading}${p.body}</section>` : p.heading + p.body
      })
      .join("")
  )
}

// ---------- a changelog ----------

/** A version of a changelog: an H2 such as "1.2.0 - 2026-10-01", and what changed in it. */
export interface Release {
  version: string
  /** The day it came out, as written (YYYY-MM-DD). */
  date?: string
  /** Its anchor: v1.2.0 for a version number, else the heading's own. */
  id?: string
  heading: string
  body: string
}

const RELEASE_DATE = /\s*(?:[-–—:]\s*)?\(?\s*(\d{4}-\d{2}-\d{2})\s*\)?/

/** The versions of a changelog, newest first as written, after the text that introduces them. */
export function releasesOf(html: string): { intro: string; releases: Release[] } {
  const { intro, parts } = sections(html)
  return {
    intro,
    releases: parts.map((p) => {
      const written = textOf(p.heading).match(/\d{4}-\d{2}-\d{2}/)?.[0]
      const date = written && !Number.isNaN(new Date(`${written}T00:00:00Z`).getTime()) ? written : undefined
      // The date leaves the heading's text for a line of its own; Keep a Changelog's brackets go too.
      const heading = p.heading.replace(/(^|>)([^<]+)/g, (_m, gt: string, text: string) => gt + text.replace(RELEASE_DATE, "").replace(/[[\]]/g, ""))
      const version = textOf(heading)
      return { version, date, id: /^v?\d/.test(version) ? `v${version.replace(/^v/, "")}` : undefined, heading, body: p.body }
    }),
  }
}

/** Keep a Changelog's kinds of change, and their usual names in other languages. */
const CHANGE_KINDS: [kind: string, heading: RegExp][] = [
  ["added", /^(added|new|features?|thêm|mới|hinzugefügt|neu|ajouté|nouveau|añadido|nuevo|追加|新增)/i],
  ["changed", /^(changed|changes|improved|thay đổi|cải tiến|geändert|modifié|cambiado|変更|变更)/i],
  ["deprecated", /^(deprecated|ngừng hỗ trợ|veraltet|obsolète|déprécié|obsoleto|非推奨|弃用)/i],
  ["removed", /^(removed|loại bỏ|đã xoá|đã xóa|entfernt|supprimé|eliminado|削除|移除)/i],
  ["fixed", /^(fixed|bug ?fixes|sửa lỗi|đã sửa|behoben|corrigé|arreglado|corregido|修正|修复)/i],
  ["security", /^(security|bảo mật|sicherheit|sécurité|seguridad|セキュリティ|安全)/i],
]

/** Where the feed of a changelog's versions is: releases.xml under its page. */
export const releasesUrl = (note: Note) => `${note.url.replace(/\/$/, "")}/releases.xml`

/**
 * A changelog: each H2 a version, its date on a line of its own and an
 * anchor of its own; Keep a Changelog's H3 sections become coloured tags.
 */
export function changelogHtml(html: string, lang: Lang, feed = ""): string {
  const { intro, releases } = releasesOf(html)
  if (!releases.length) return html
  const tag = (body: string) =>
    body.replace(/<h3([^>]*)>([\s\S]*?)<\/h3>/g, (h3, attrs: string, inner: string) => {
      const kind = CHANGE_KINDS.find(([, re]) => re.test(textOf(inner)))?.[0]
      return kind ? `<h3${attrs} class="change-tag change-${kind}">${inner}</h3>` : h3
    })
  const out = releases.map((r) => {
    const date = r.date
      ? `<p class="release-date"><time datetime="${r.date}">${escapeAttr(formatDate(new Date(`${r.date}T00:00:00Z`), lang))}</time></p>`
      : ""
    return `<section class="release"${r.id ? ` id="${escapeAttr(r.id)}"` : ""}>${r.heading}${date}${tag(r.body)}</section>`
  })
  return intro + feed + out.join("")
}

// ---------- a dialogue ----------

/** "**Ada:** text", "**Ada**: text" or "Ada: text" at the start of a paragraph. */
const SAID = /^<p>\s*(?:<strong>([^<]{1,40}?)\s*(:?)\s*<\/strong>\s*(:?)|([\p{L}][\p{L}\p{N}.'’ -]{0,38}?)\s*(:))\s*/u
/** Bubble colours: a speaker keeps one, from this many. */
const VOICES = 6

/**
 * A dialogue: runs of paragraphs that start with a speaker's name become
 * chat bubbles, each speaker on a side and in a colour of their own. A name
 * in bold always counts; a plain one only when it opens two paragraphs or
 * more, or is one of `speakers`, so "Note: …" stays a paragraph. `speakers`
 * maps names to their pictures.
 */
export function dialogueHtml(html: string, speakers: Record<string, string | undefined> = {}): string {
  const parts = html.split(/(<p>[\s\S]*?<\/p>)/)
  const known = new Map(Object.entries(speakers).map(([name, src]) => [name.toLowerCase(), src]))
  const said = (part: string) => {
    const m = part.match(SAID)
    if (!m) return undefined
    const bold = m[1] !== undefined
    if (bold && !m[2] && !m[3]) return undefined
    return { name: (bold ? m[1] : m[4]).trim(), bold, rest: part.slice(m[0].length) }
  }
  // How many paragraphs each name opens.
  const opens = new Map<string, number>()
  for (const part of parts) {
    const key = said(part)?.name.toLowerCase()
    if (key) opens.set(key, (opens.get(key) ?? 0) + 1)
  }
  const order: string[] = []
  const out: string[] = []
  let run: string[] = []
  let last = ""
  const flush = () => {
    if (run.length) out.push(`<div class="dialogue">${run.join("")}</div>`)
    run = []
    last = ""
  }
  for (const part of parts) {
    const s = said(part)
    const key = s?.name.toLowerCase() ?? ""
    if (s && (s.bold || known.has(key) || (opens.get(key) ?? 0) > 1)) {
      if (!order.includes(key)) order.push(key)
      const i = order.indexOf(key)
      const src = known.get(key)
      const avatar = src ? `<img class="dialogue-avatar" src="${escapeAttr(src)}" alt="" loading="lazy">` : ""
      const cls = ["dialogue-line", `voice-${i % VOICES}`, i % 2 ? "is-end" : "", key === last ? "is-more" : ""].filter(Boolean).join(" ")
      run.push(`<div class="${cls}"><p class="dialogue-who">${avatar}<span>${s.name}</span></p><div class="dialogue-bubble"><p>${s.rest}</div></div>`)
      last = key
    } else if (part.trim() || !run.length) {
      flush()
      out.push(part)
    }
  }
  flush()
  return out.join("")
}

// ---------- reading highlights ----------

/** Where a highlight is in its book: "(Location 123)", "(p. 45)", "— location: [123](kindle://…)". */
const LOCATOR =
  /\s*(?:\(\s*((?:<a\b[^>]*>)?\s*(?:loc(?:ation)?\.?|page|pg\.?|pp?\.)\s*:?\s*[\dxivlc]+(?:\s*[-–]\s*[\dxivlc]+)?\s*(?:<\/a>)?)\s*\)|[—–]\s*((?:loc(?:ation)?|page)\s*:\s*(?:<a\b[^>]*>)?\s*\d+(?:\s*[-–]\s*\d+)?\s*(?:<\/a>)?))/i

/** A highlight as a card: its text, where it is in the book, and the reader's note. */
function highlightCard(text: string, note: string): string {
  let at = ""
  const quote = text.replace(LOCATOR, (_m, a?: string, b?: string) => {
    at = (a ?? b)!
    return ""
  })
  // "Note: …" marks the reader's own words in Readwise and Kindle exports.
  const own = note.replace(/^((?:\s*<(?:p|ul|ol|li)>)*)\s*(?:<strong>)?\s*note\s*:\s*(?:<\/strong>)?\s*/i, "$1")
  return (
    `<figure class="highlight-card"><blockquote>${quote.includes("<p>") ? quote.trim() : `<p>${quote.trim()}</p>`}</blockquote>` +
    (own.trim() ? `<div class="highlight-note">${own.trim()}</div>` : "") +
    (at ? `<figcaption>${at.trim()}</figcaption>` : "") +
    `</figure>`
  )
}

/** The cards of a run of text: each quote with the paragraphs after it, each item of a list with what it nests. */
function highlightCards(html: string): string {
  const out: string[] = []
  let cards: string[] = []
  const flush = () => {
    if (cards.length) out.push(`<div class="highlight-list">${cards.join("")}</div>`)
    cards = []
  }
  const blocks = topLevel(html, ["blockquote", "ul", "ol"])
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.tag === "blockquote") {
      // The paragraphs right after a quote are the reader's note on it.
      const next = blocks[i + 1]
      const lead = next && !next.tag ? (next.html.match(/^(?:\s*<p>[\s\S]*?<\/p>)+/)?.[0] ?? "") : ""
      cards.push(highlightCard(innerOf(b.html), lead))
      if (lead) next.html = next.html.slice(lead.length)
    } else if (b.tag) {
      for (const li of topLevel(innerOf(b.html), ["li"]).filter((x) => x.tag)) {
        const inner = innerOf(li.html)
        const nested = inner.search(/<(ul|ol)\b/)
        if (nested < 0) {
          cards.push(highlightCard(inner, ""))
          continue
        }
        // What the item nests is the reader's note: one item as its text, more as a list.
        const list = topLevel(inner.slice(nested), ["ul", "ol"])[0].html
        const items = topLevel(innerOf(list), ["li"]).filter((x) => x.tag)
        cards.push(highlightCard(inner.slice(0, nested), items.length === 1 ? innerOf(items[0].html) : list))
      }
    } else if (b.html.trim() || !cards.length) {
      flush()
      out.push(b.html)
    }
  }
  flush()
  return out.join("")
}

/**
 * Reading highlights, as Readwise or a Kindle plugin exports them: every
 * quote and every list item becomes a card with its location and the note
 * under it. A Metadata section stays as it is.
 */
export function highlightsHtml(html: string): string {
  const { intro, parts } = sections(html)
  return (
    highlightCards(intro) +
    parts.map((p) => p.heading + (/^(metadata|siêu dữ liệu|metadaten|métadonnées|metadatos)$/i.test(textOf(p.heading)) ? p.body : highlightCards(p.body))).join("")
  )
}

// ---------- a glossary ----------

/** A term of a glossary page: how it is written (HTML), its anchor and its definition. */
export interface GlossaryEntry {
  term: string
  id?: string
  definition: string
}

/** A term in bold opening a paragraph, then a colon or a dash: "**Term**: what it means." */
const BOLD_TERM = /^<p>\s*<strong>([\s\S]+?)\s*(:?)\s*<\/strong>\s*([:—–-]?)\s*([\s\S]*)<\/p>$/

/** The terms a glossary page defines, after the text that introduces them. */
export function glossaryEntries(html: string): { intro: string; entries: GlossaryEntry[] } {
  let intro = ""
  const entries: GlossaryEntry[] = []
  for (const chunk of html.split(/(?=<h[23][\s>])/)) {
    const heading = chunk.match(/^<h([23])[^>]*>[\s\S]*?<\/h\1>/)?.[0] ?? ""
    // A heading of one letter only groups terms; any other names one.
    if (heading && !/^\p{L}$/u.test(textOf(heading))) entries.push({ term: innerOf(heading).replace(ANCHOR, ""), id: idOf(heading), definition: "" })
    for (const part of chunk.slice(heading.length).split(/(<p>[\s\S]*?<\/p>)/)) {
      const m = part.match(BOLD_TERM)
      if (m && (m[2] || m[3])) entries.push({ term: m[1], definition: m[4].trim() ? `<p>${m[4].trim()}</p>` : "" })
      else if (entries.length) entries.at(-1)!.definition += part
      else intro += part
    }
  }
  return { intro, entries }
}

/** The letter a term is filed under: its first, without accents, or # for a digit or a sign. */
export function letterOf(term: string, lang: Lang): string {
  const first = [...term.normalize("NFD").replace(/[̀-ͯ]/g, "")][0] ?? ""
  return /\p{L}/u.test(first) ? first.toLocaleUpperCase(lang) : "#"
}

const LATIN = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]

/**
 * A glossary: every term A–Z in a list of definitions, under its letter,
 * each with an anchor of its own, and a bar of letters to jump to.
 */
export function glossaryHtml(intro: string, entries: GlossaryEntry[], lang: Lang, label: string): string {
  if (!entries.length) return intro
  const collator = new Intl.Collator(lang, { numeric: true, sensitivity: "base" })
  const sorted = [...entries].sort((a, b) => collator.compare(textOf(a.term), textOf(b.term)))
  const used = new Set(sorted.map((e) => e.id).filter(Boolean))
  const groups = new Map<string, string[]>()
  for (const e of sorted) {
    const text = textOf(e.term)
    let id = e.id
    if (!id) {
      const base = text.toLocaleLowerCase(lang).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "term"
      id = base
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`
      used.add(id)
    }
    const letter = letterOf(text, lang)
    if (!groups.has(letter)) groups.set(letter, [])
    groups
      .get(letter)!
      .push(
        `<div class="glossary-entry" id="${escapeAttr(id)}"><dt>${e.term}<a class="heading-anchor" aria-hidden="true" tabindex="-1" href="#${escapeAttr(id)}">#</a></dt><dd>${e.definition}</dd></div>`,
      )
  }
  const letterId = (l: string) => `letter-${l === "#" ? "other" : l.toLocaleLowerCase(lang)}`
  // Digits and signs come after the letters.
  const present = [...groups.keys()].sort((a, b) => Number(a === "#") - Number(b === "#"))
  // A–Z for terms in Latin letters, with the missing ones greyed; any other letter as it comes.
  const bar = [...(present.some((l) => LATIN.includes(l)) ? LATIN : []), ...present.filter((l) => !LATIN.includes(l))].map((l) =>
    groups.has(l) ? `<a href="#${escapeAttr(letterId(l))}">${escapeAttr(l)}</a>` : `<span aria-hidden="true">${l}</span>`,
  )
  const body = present.map(
    (l) =>
      `<section class="glossary-group" id="${escapeAttr(letterId(l))}"><h2 class="glossary-letter">${escapeAttr(l)}</h2><dl>${groups.get(l)!.join("")}</dl></section>`,
  )
  return `${intro}<nav class="glossary-letters" aria-label="${escapeAttr(label)}">${bar.join("")}</nav>${body.join("")}`
}

/** Notes tagged as terms that a glossary page does not define itself, as entries linking to them. */
function termNotes(note: Note, defined: GlossaryEntry[]): GlossaryEntry[] {
  const names = new Set(defined.map((e) => textOf(e.term).toLocaleLowerCase(note.lang)))
  const byKey = getVault().byKey[note.lang]
  return glossary(note.lang).terms.flatMap((term) => {
    const n = byKey.get(term.key)!
    if (n.key === note.key || term.names.some((x) => names.has(x.toLocaleLowerCase(note.lang)))) return []
    return [
      {
        term: `<a class="internal" href="${escapeAttr(n.url)}" data-key="${escapeAttr(n.key)}">${escapeAttr(n.title)}</a>`,
        definition: n.description ? `<p>${escapeAttr(n.description)}</p>` : "",
      },
    ]
  })
}

// ---------- a trip ----------

/** A line of its own giving where a stop is: "📍 35.01, 135.77" or "location: 35.01, 135.77". */
const PIN = /<p>\s*(?:📍|location\s*:)\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*<\/p>\s*/iu

/** The place a note is at, if it has a location and is published. */
function placeOfNote(note: Note, key: string): Place | undefined {
  const n = getVault().byKey[note.lang].get(key)
  const loc = n && !n.protected ? parseLocation(n.source.fm.location ?? n.source.fm.coordinates) : undefined
  return loc && { lat: loc[0], lng: loc[1], title: n!.title, url: n!.url, description: n!.description }
}

/** The places of a trip's `route`: notes with a location, "lat, lng" pairs, or { name, location }. */
export function routeOf(note: Note): Place[] {
  const raw = note.source.fm.route
  const vault = getVault()
  return (Array.isArray(raw) ? raw : []).flatMap((item, i): Place[] => {
    const link = typeof item === "string" ? item.match(/^\[\[([^\]|#]+)/) : null
    if (link) {
      const s = vault.resolveNote(link[1], note.dir)
      const place = s && placeOfNote(note, s.key)
      return place ? [place] : []
    }
    const named = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : undefined
    const loc = parseLocation(named?.location ?? item)
    return loc ? [{ lat: loc[0], lng: loc[1], title: plain(named?.name) || String(i + 1), url: "" }] : []
  })
}

/**
 * A trip: each H2 a day or a stop, numbered down the page, its pictures in a
 * strip; a map of the route (`route`, else where each stop is) goes first.
 * A stop is where its own 📍 line says, else at the first note it links to
 * with a location.
 */
export function tripHtml(note: Note, html: string): string {
  const { intro, parts } = sections(html)
  if (!parts.length) return html
  const s = t(note.lang)
  const stops: Place[] = []
  const days = parts.map((p) => {
    const title = textOf(p.heading)
    const pin = p.body.match(PIN)
    const linked = (p.heading + p.body).match(/class="internal" data-key="([^"]*)"/)
    const place = pin ? { lat: Number(pin[1]), lng: Number(pin[2]) } : linked ? placeOfNote(note, unescapeHtml(linked[1])) : undefined
    const id = idOf(p.heading)
    if (place && parseLocation([place.lat, place.lng])) stops.push({ lat: place.lat, lng: place.lng, title, url: id ? `#${id}` : "" })
    const body = galleryHtml(pin ? p.body.replace(PIN, "") : p.body, `<div class="trip-strip" role="group" aria-label="${escapeAttr(title)}" tabindex="0">`)
    return `<li class="trip-stop">${p.heading}<div class="trip-body">${body}</div></li>`
  })
  const route = routeOf(note)
  const places = route.length ? route : stops
  const map = places.length
    ? `<div class="map-canvas trip-map" role="region" aria-label="${escapeAttr(s.map)}" data-map="${escapeAttr(JSON.stringify(places))}"${places.length > 1 ? " data-route" : ""}` +
      ` data-tiles="${escapeAttr(site.map.tiles)}"${site.map.darkTiles ? ` data-tiles-dark="${escapeAttr(site.map.darkTiles)}"` : ""} data-attribution="${escapeAttr(site.map.attribution)}"></div>`
    : ""
  return `${intro}${map}<ol class="trip-stops">${days.join("")}</ol>`
}

// ---------- a syllabus ----------

/** A lesson of a course: its heading, how long it takes to read, and what it says. */
export interface Lesson {
  id: string
  heading: string
  minutes?: number
  body: string
}

/** The lessons of a course: its H2 sections, else the notes of its series. */
export function lessonsOf(note: Note, parts: { heading: string; body: string }[]): Lesson[] {
  if (parts.length) {
    return parts.map((p, i) => ({ id: idOf(p.heading) ?? `lesson-${i + 1}`, heading: p.heading, minutes: minutesOf(wordsIn(textOf(p.body))), body: p.body }))
  }
  const own = typeof note.source.fm.series === "string" ? note.source.fm.series.trim() : ""
  const series = [...allSeries(note.lang).entries()].find(([key, s]) => key === own || s.intro?.key === note.key)?.[1]
  return (series?.parts ?? [])
    .filter((n) => n.key !== note.key)
    .map((n, i) => ({
      id: n.key,
      heading: `<h2 id="lesson-${i + 1}"><a class="internal" href="${escapeAttr(n.url)}" data-key="${escapeAttr(n.key)}">${escapeAttr(n.title)}</a></h2>`,
      // A protected lesson tells nothing of its length.
      minutes: n.protected ? undefined : minutesOf(wordsIn(n.md.replace(/<[^>]+>|[#*_>`[\]()!|]/g, " "))),
      body: n.description && !n.protected ? `<p>${escapeAttr(n.description)}</p>` : "",
    }))
}

/**
 * A syllabus: numbered lessons, each with its reading time and a box to tick
 * once done; the browser keeps the ticks and shows the progress.
 */
export function syllabusHtml(intro: string, lessons: Lesson[], lang: Lang): string {
  if (!lessons.length) return intro
  const s = t(lang)
  const total = lessons.length
  const items = lessons.map(
    (l) =>
      `<li class="lesson" data-lesson="${escapeAttr(l.id)}"><div class="lesson-head">${l.heading}` +
      (l.minutes ? `<span class="lesson-time">${escapeAttr(s.readingTime(l.minutes))}</span>` : "") +
      `<label class="lesson-done"><input type="checkbox" data-lesson-done><span class="sr-only">${escapeAttr(textOf(l.heading))}: </span>${escapeAttr(s.lessonDone)}</label></div>` +
      (l.body.trim() ? `<div class="lesson-body">${l.body}</div>` : "") +
      `</li>`,
  )
  const count = s.syllabusProgress.replace("{done}", "0").replace("{total}", String(total))
  return (
    intro +
    `<div class="syllabus-progress" data-syllabus-progress data-template="${escapeAttr(s.syllabusProgress)}" hidden><progress max="${total}" value="0" aria-hidden="true"></progress><span>${escapeAttr(count)}</span></div>` +
    `<ol class="syllabus">${items.join("")}</ol>`
  )
}

// ---------- a poem ----------

/** Block elements a poem, a letter or a comparison is made of. */
const BLOCKS = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "div", "section", "figure", "pre", "table", "details", "dl"]

/** The top-level blocks of some HTML, and whatever stands between them (an <hr>), each trimmed; blank text left out. */
const blocksOf = (html: string) =>
  topLevel(html, BLOCKS)
    .map((b) => b.html.trim())
    .filter(Boolean)

/** A paragraph is a stanza. */
const stanza = (block: string) => block.replace(/^<p>/, '<p class="stanza">')

/** The translation a poem is shown beside: its HTML, its language, and whether it is the original, to go first. */
export interface PoemPair {
  html: string
  lang: Lang
  ownLang: Lang
  first: boolean
}

/**
 * A poem: its stanzas centred on the page, their lines and indentation kept,
 * numbered when `numbered`. With a translation, the two go side by side,
 * stanza by stanza: a block both languages share spans the two.
 */
export function poemHtml(html: string, numbered: boolean, pair?: PoemPair): string {
  const cls = `poem${numbered ? " is-numbered" : ""}`
  if (!pair) return `<div class="${cls}">${blocksOf(html).map(stanza).join("")}</div>`
  const own = blocksOf(html)
  const other = blocksOf(pair.html)
  const [left, right] = pair.first ? [other, own] : [own, other]
  const [l, r] = pair.first ? [pair.lang, pair.ownLang] : [pair.ownLang, pair.lang]
  const col = (lang: Lang, block = "") => `<div class="poem-col" lang="${escapeAttr(lang)}">${stanza(block)}</div>`
  const rows = Array.from({ length: Math.max(left.length, right.length) }, (_, i) =>
    left[i] === right[i] ? `<div class="poem-pair is-shared">${stanza(left[i])}</div>` : `<div class="poem-pair">${col(l, left[i])}${col(r, right[i])}</div>`,
  )
  const head = `<div class="poem-pair poem-langs">${[l, r].map((x) => `<p lang="${escapeAttr(x)}">${escapeAttr(langMeta(x).name)}</p>`).join("")}</div>`
  return `<div class="${cls} is-bilingual">${head}${rows.join("")}</div>`
}

// ---------- a letter ----------

/** How a letter is signed: a picture of the signature, or the name in words. */
export interface Signature {
  image?: string
  text?: string
  alt: string
}

const wordCount = (html: string) => wordsIn(textOf(html))

/**
 * A letter: the place and date on a line of their own, the first paragraph
 * as the salutation, and the closing and signature at the foot. The
 * signature is `signature`, after the last paragraph as the closing; else the
 * last line of the last paragraph, the lines before it the closing; a last
 * paragraph of one line follows a short paragraph (six words at most) as the closing. A body paragraph always stays.
 */
export function letterHtml(html: string, dateline: { place?: string; date?: string; datetime?: string }, signature?: Signature): string {
  const blocks = topLevel(html, BLOCKS).filter((b) => b.tag || b.html.trim())
  const paras = blocks.flatMap((b, i) => (b.tag === "p" ? [i] : []))
  const salutation = paras.length > 1 ? paras[0] : undefined
  // Past the salutation and the first paragraph of the body.
  const tail = paras.slice(salutation === undefined ? 1 : 2)
  let closing: number | undefined
  let sign = ""
  let signedAt: number | undefined
  if (signature) {
    closing = tail.at(-1)
    sign = signature.image
      ? `<img class="letter-signature-image" src="${escapeAttr(signature.image)}" alt="${escapeAttr(signature.alt)}" loading="lazy">`
      : `<p class="letter-signature">${escapeAttr(signature.text ?? "")}</p>`
  } else if (tail.length) {
    signedAt = tail.at(-1)!
    const lines = innerOf(blocks[signedAt].html).trim().split(/<br>\n?|\n/)
    sign = `<p class="letter-signature">${lines.pop()!.trim()}</p>`
    if (lines.length) {
      blocks[signedAt].html = `<p>${lines.join("<br>\n")}</p>`
      closing = signedAt
      signedAt = undefined
    } else {
      const before = tail.at(-2)
      if (before !== undefined && wordCount(blocks[before].html) <= 6) closing = before
    }
  }
  const out = blocks.map((b, i) => {
    if (i === salutation) return b.html.replace(/^<p>/, '<p class="letter-salutation">')
    if (i === signedAt) return closing === undefined ? `<div class="letter-sign">${sign}</div>` : ""
    if (i === closing) return `<div class="letter-sign">${b.html.replace(/^<p>/, '<p class="letter-closing">')}${sign}</div>`
    return b.html
  })
  // A signature with no closing paragraph to stand under ends the letter on its own.
  if (signature && closing === undefined) out.push(`<div class="letter-sign">${sign}</div>`)
  const { place, date, datetime } = dateline
  const when = date ? (datetime ? `<time datetime="${escapeAttr(datetime)}">${escapeAttr(date)}</time>` : escapeAttr(date)) : ""
  const line = place || date ? `<p class="letter-dateline">${escapeAttr(place ?? "")}${place && date ? ", " : ""}${when}</p>` : ""
  return `<div class="letter">${line}${out.join("")}</div>`
}

/** A letter's place, its date written out, and how it is signed. */
function letterFacts(note: Note): { dateline: { place?: string; date?: string; datetime?: string }; signature?: Signature } {
  const fm = note.source.fm
  const s = t(note.lang)
  const d = dateOf(fm.date)
  const text = plain(fm.signature)
  return {
    dateline: {
      place: plain(fm.place) || undefined,
      date: d ? d.toLocaleDateString(note.lang, { dateStyle: "long", timeZone: "UTC" }) : plain(fm.date) || undefined,
      datetime: d ? dayKey(d) : undefined,
    },
    signature: note.signature ? { image: note.signature, alt: s.signature } : text ? { text, alt: s.signature } : undefined,
  }
}

// ---------- a comparison ----------

/** An option of a comparison: its heading, what is said for and against it, and its facts. */
export interface CompareOption {
  heading: string
  name: string
  id?: string
  pros: string[]
  cons: string[]
  /** `key: value` lines, in order. */
  facts: [key: string, value: string][]
  body: string
}

const PRO = /^(\s*(?:<p>)?\s*)(?:✅|✔️?|👍|➕)\s*/u
const CON = /^(\s*(?:<p>)?\s*)(?:❌|✖️?|✗|👎|➖|⛔)\s*/u
const PROS_HEADING = /^(pros|advantages|for|ưu điểm|điểm mạnh|vorteile|pro|avantages|ventajas|メリット|長所|优点|優點)$/i
const CONS_HEADING = /^(cons|disadvantages|against|nhược điểm|điểm yếu|nachteile|contra|inconvénients|desventajas|デメリット|短所|缺点|缺點)$/i
/** "Price: 10 €" or a Dataview field "Price:: 10 €", the key in plain words. */
const FACT = /^\s*([^<>:\n]{1,40}?)\s*::?\s+(\S[\s\S]*?)\s*$/

/** The facts a run of lines gives, when every line is one. */
function factsOf(lines: string[]): [string, string][] | undefined {
  const facts = lines.map((l) => l.match(FACT))
  return facts.length && facts.every(Boolean) ? facts.map((m) => [m![1], m![2]]) : undefined
}

/** The options of a comparison, each H2, after the text that introduces them. */
export function compareOf(html: string): { intro: string; options: CompareOption[] } {
  const { intro, parts } = sections(html)
  const options = parts.map((p): CompareOption => {
    const option: CompareOption = { heading: p.heading, name: textOf(p.heading), id: idOf(p.heading), pros: [], cons: [], facts: [], body: "" }
    let side: "pros" | "cons" | undefined
    for (const b of topLevel(p.body, BLOCKS)) {
      if (b.tag && /^h[3-6]$/.test(b.tag)) {
        const name = textOf(b.html)
        side = PROS_HEADING.test(name) ? "pros" : CONS_HEADING.test(name) ? "cons" : undefined
        if (side) continue
      } else if (b.tag === "ul" || b.tag === "ol") {
        const items = topLevel(innerOf(b.html), ["li"])
          .filter((x) => x.tag)
          .map((x) => innerOf(x.html))
        if (side) {
          option[side].push(...items)
          continue
        }
        if (items.every((li) => PRO.test(li) || CON.test(li))) {
          for (const li of items) {
            if (PRO.test(li)) option.pros.push(li.replace(PRO, "$1"))
            else option.cons.push(li.replace(CON, "$1"))
          }
          continue
        }
        const facts = factsOf(items.map((li) => li.replace(/^\s*<p>|<\/p>\s*$/g, "")))
        if (facts) {
          option.facts.push(...facts)
          continue
        }
      } else if (b.tag === "p") {
        const facts = factsOf(innerOf(b.html).split(/<br>\n?|\n/))
        if (facts) {
          option.facts.push(...facts)
          continue
        }
      }
      if (b.tag || b.html.trim()) option.body += b.html
    }
    return option
  })
  return { intro, options }
}

/**
 * A comparison: each option a card, what speaks for and against it in two
 * columns, and a table of their facts side by side; `pick` (an option's
 * name) is the one chosen.
 */
export function compareHtml(
  intro: string,
  options: CompareOption[],
  pick: string,
  labels: { pros: string; cons: string; summary: string; picked: string },
): string {
  if (!options.length) return intro
  const picked = (o: CompareOption) => !!pick && o.name.toLocaleLowerCase() === pick.trim().toLocaleLowerCase()
  const badge = `<p class="compare-badge">${escapeAttr(labels.picked)}</p>`
  // Facts by key, whatever its case, in the order they first come.
  const keys = new Map<string, string>()
  for (const o of options) for (const [k] of o.facts) if (!keys.has(k.toLowerCase())) keys.set(k.toLowerCase(), k)
  const cell = (o: CompareOption, key: string) => o.facts.find(([k]) => k.toLowerCase() === key)?.[1] ?? "—"
  const table = keys.size
    ? `<div class="table-wrap compare-table" role="region" aria-label="${escapeAttr(labels.summary)}" tabindex="0"><table><caption>${escapeAttr(labels.summary)}</caption>` +
      `<thead><tr><td></td>${options.map((o) => `<th scope="col"${picked(o) ? ' class="is-picked"' : ""}>${escapeAttr(o.name)}</th>`).join("")}</tr></thead><tbody>` +
      [...keys]
        .map(([key, label]) => `<tr><th scope="row">${escapeAttr(label)}</th>${options.map((o) => `<td${picked(o) ? ' class="is-picked"' : ""}>${cell(o, key)}</td>`).join("")}</tr>`)
        .join("") +
      `</tbody></table></div>`
    : ""
  const side = (cls: string, label: string, items: string[]) =>
    items.length ? `<div class="compare-${cls}"><p class="compare-label">${escapeAttr(label)}</p><ul>${items.map((li) => `<li>${li}</li>`).join("")}</ul></div>` : ""
  const cards = options.map(
    (o) =>
      `<section class="compare-option${picked(o) ? " is-picked" : ""}">${o.heading}${picked(o) ? badge : ""}${o.body}` +
      (o.pros.length || o.cons.length ? `<div class="compare-procon">${side("pros", labels.pros, o.pros)}${side("cons", labels.cons, o.cons)}</div>` : "") +
      `</section>`,
  )
  return `${intro}${table}<div class="compare-options">${cards.join("")}</div>`
}

// ---------- a checklist ----------

/** A task's checkbox, as the markdown renders it: read only. */
const TASK_BOX = /<input type="checkbox"([^>]*)>/g

/**
 * A checklist: every task of the note, outside task queries, a box the
 * reader ticks, the browser keeping the ticks; each section counts its own,
 * and a bar the whole, with a button back to the list as written.
 */
export function checklistHtml(html: string, labels: { progress: string; reset: string }): string {
  const used = new Set<string>()
  let total = 0
  // Tasks a query gathers from other notes stay as they are.
  const marked = topLevel(html, ["div"])
    .map((b) =>
      b.tag && b.html.startsWith('<div class="dataview dv-tasks')
        ? b.html
        : b.html.replace(TASK_BOX, (_m, attrs: string) => {
            const label = unescapeHtml(attrs.match(/aria-label="([^"]*)"/)?.[1] ?? "")
            const base = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "item"
            let id = base
            for (let n = 2; used.has(id); n++) id = `${base}-${n}`
            used.add(id)
            total++
            return `<input type="checkbox"${attrs.replace(/\sdisabled(="")?/, "")} data-check="${escapeAttr(id)}">`
          }),
    )
    .join("")
  if (!total) return html
  const { intro, parts } = sections(marked)
  const body = parts
    .map((p) =>
      p.body.includes("data-check=")
        ? `<section class="checklist-section" data-checklist-section>${p.heading}<p class="checklist-count" data-checklist-count hidden></p>${p.body}</section>`
        : p.heading + p.body,
    )
    .join("")
  const bar =
    `<div class="checklist-progress" data-checklist-progress data-template="${escapeAttr(labels.progress)}" hidden><progress max="${total}" value="0" aria-hidden="true"></progress>` +
    `<span>${escapeAttr(labels.progress.replace("{done}", "0").replace("{total}", String(total)))}</span><button type="button" class="checklist-reset" data-checklist-reset>${escapeAttr(labels.reset)}</button></div>`
  return `<div class="checklist" data-checklist>${bar}${intro}${body}</div>`
}

// ---------- a recipe card ----------

/** A recipe on a card: its picture, how long it takes and how many it feeds, its ingredients beside its steps, and a button to print it. */
export function recipeCardHtml(note: Note, html: string, print: string): string {
  const facts = recipeFacts(note)
  return (
    `<div class="recipe-card">` +
    (note.cover ? `<img class="recipe-card-cover" src="${escapeAttr(note.cover)}" alt="" loading="lazy">` : "") +
    (facts.length ? `<p class="recipe-card-facts">${facts.map(escapeAttr).join(" · ")}</p>` : "") +
    recipeHtml(html) +
    `</div><p class="recipe-card-tools"><button type="button" class="recipe-card-print" data-print>${escapeAttr(print)}</button></p>`
  )
}

// ---------- a hub ----------

/** A section of a hub, a spoke of its map: its heading and the links it holds, its leaves. */
export interface Spoke {
  label: string
  id?: string
  leaves: { label: string; href: string }[]
}

/** Links of some HTML that lead somewhere else: not a heading's anchor, a footnote or a place on the page. */
function linksIn(html: string): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = []
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const href = unescapeHtml(m[1].match(/\shref="([^"]*)"/)?.[1] ?? "")
    const label = textOf(m[2])
    if (!href || href.startsWith("#") || /heading-anchor|data-footnote/.test(m[1]) || !label || out.some((l) => l.href === href)) continue
    out.push({ label, href })
  }
  return out
}

/** The spokes of a hub: its H2 sections and their links. */
export function spokesOf(parts: { heading: string; body: string }[]): Spoke[] {
  return parts.map((p) => ({ label: textOf(p.heading), id: idOf(p.heading), leaves: linksIn(p.body) }))
}

/** At most this many leaves are drawn on a spoke; a last one counts the others. */
const LEAVES = 8
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const at = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return [+(r * Math.cos(a)).toFixed(1), +(r * Math.sin(a)).toFixed(1)] as const
}

/** A label beside a point, away from the centre. */
function label(x: number, y: number, deg: number, text: string, cls: string): string {
  const cos = Math.cos((deg * Math.PI) / 180)
  const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle"
  const [dx, dy] = anchor === "middle" ? [0, y < 0 ? -14 : 22] : [anchor === "start" ? 12 : -12, 5]
  return `<text class="${cls}" x="${+(x + dx).toFixed(1)}" y="${+(y + dy).toFixed(1)}" text-anchor="${anchor}">${escapeAttr(text)}</text>`
}

/**
 * A hub's map, drawn here as an SVG: the note in the centre, its sections as
 * spokes around it, each section's links as leaves around its spoke. The map
 * is a picture for the eye: the sections below say the same to everyone else.
 */
export function hubSvg(title: string, spokes: Spoke[]): string {
  const lines: string[] = []
  const nodes: string[] = []
  // How far the drawing reaches, for its frame: the centre's box, then every point drawn.
  const box = { x0: -60, x1: 60, y0: -30, y1: 30 }
  const reach = (x: number, y: number) => {
    box.x0 = Math.min(box.x0, x)
    box.x1 = Math.max(box.x1, x)
    box.y0 = Math.min(box.y0, y)
    box.y1 = Math.max(box.y1, y)
  }
  const n = spokes.length
  spokes.forEach((spoke, i) => {
    const deg = -90 + (360 / n) * i
    const [sx, sy] = at(150, deg)
    reach(sx, sy)
    lines.push(`<line class="hub-spoke-line" x1="0" y1="0" x2="${sx}" y2="${sy}"/>`)
    const shown = spoke.leaves.length > LEAVES ? [...spoke.leaves.slice(0, LEAVES - 1), { label: `+${spoke.leaves.length - LEAVES + 1}`, href: "" }] : spoke.leaves
    // The leaves of a spoke fan out across its share of the circle.
    const spread = Math.min((360 / n) * 0.8, 22 * (shown.length - 1))
    shown.forEach((leaf, j) => {
      const ldeg = shown.length > 1 ? deg - spread / 2 + (spread * j) / (shown.length - 1) : deg
      const [lx, ly] = at(shown.length > 4 && j % 2 ? 330 : 290, ldeg)
      reach(lx, ly)
      lines.push(`<line class="hub-leaf-line" x1="${sx}" y1="${sy}" x2="${lx}" y2="${ly}"/>`)
      const dot = `<circle class="hub-leaf" cx="${lx}" cy="${ly}" r="5"/>${label(lx, ly, ldeg, clip(leaf.label, 22), "hub-leaf-label")}`
      nodes.push(leaf.href ? `<a href="${escapeAttr(leaf.href)}" tabindex="-1"><title>${escapeAttr(leaf.label)}</title>${dot}</a>` : `<g>${dot}</g>`)
    })
    const node = `<circle class="hub-spoke hub-c${i % 6}" cx="${sx}" cy="${sy}" r="11"/>${label(sx, sy, deg, clip(spoke.label, 20), "hub-spoke-label")}`
    nodes.push(spoke.id ? `<a href="#${escapeAttr(spoke.id)}" tabindex="-1"><title>${escapeAttr(spoke.label)}</title>${node}</a>` : `<g>${node}</g>`)
  })
  // The centre is as wide as the note's title, roughly 9 units a letter.
  const name = clip(title, 24)
  const w = Math.max(80, name.length * 9 + 28)
  const centre = `<rect class="hub-centre" x="${-w / 2}" y="-20" width="${w}" height="40" rx="20"/><text class="hub-centre-label" y="6" text-anchor="middle">${escapeAttr(name)}</text>`
  // Room around the points for their labels: wide beside them, a line above and below.
  const view = [box.x0 - 190, box.y0 - 40, box.x1 - box.x0 + 380, box.y1 - box.y0 + 80].map((v) => Math.round(v)).join(" ")
  return `<svg class="hub-svg" viewBox="${view}" aria-hidden="true" focusable="false"><g>${lines.join("")}</g>${nodes.join("")}${centre}</svg>`
}

/** A hub, a map of content: its map, then its sections as a list, the map's words for readers, keyboards and paper. */
export function hubHtml(title: string, html: string): string {
  const { intro, parts } = sections(html)
  if (!parts.length) return html
  const list = parts.map((p) => `<li class="hub-section">${p.heading}${p.body}</li>`).join("")
  return `${intro}<figure class="hub-map" aria-hidden="true">${hubSvg(title, spokesOf(parts))}</figure><ul class="hub-sections">${list}</ul>`
}

// ---------- lore ----------

/** A relation of a worldbuilding entity: its name (ally, parent…) and who it is with. */
export interface Relation {
  name: string
  refs: (Ref & { key?: string })[]
}

/** `[[X]]` written without quotes reads in YAML as a list in a list: it is a link all the same. */
const asLink = (v: unknown): unknown => (Array.isArray(v) && v.length === 1 && Array.isArray(v[0]) && v[0].length === 1 ? `[[${String(v[0][0])}]]` : v)

/**
 * The relations a lore note names in `relations`: a map of names to notes
 * (`ally: "[[X]]"`, a list for several), or a list of "ally: [[X]]".
 */
export function relationsOf(note: Note): Relation[] {
  const raw = note.source.fm.relations
  const vault = getVault()
  const pairs: [string, unknown][] = Array.isArray(raw)
    ? raw.flatMap((item): [string, unknown][] => {
        if (item && typeof item === "object" && !Array.isArray(item)) return Object.entries(item as Record<string, unknown>)
        const m = typeof item === "string" ? item.match(/^\s*([^:[]+?)\s*:\s*(.+)$/) : null
        return m ? [[m[1], m[2]]] : []
      })
    : raw && typeof raw === "object"
      ? Object.entries(raw as Record<string, unknown>)
      : []
  return pairs.flatMap(([name, v]) => {
    const list = asLink(v)
    const items = (Array.isArray(list) ? list.map(asLink) : [list]).flatMap((x) => (typeof x === "string" ? x.split(/\s*,\s*(?![^[]*\]\])/) : [x]))
    const refs = items.flatMap((x) =>
      refsOf(note, [x]).map((r) => {
        const target = typeof x === "string" ? x.match(/^\[\[([^\]|#]+)/)?.[1] : undefined
        const s = target ? vault.resolveNote(target, note.dir) : undefined
        return { ...r, key: s && r.href ? s.key : undefined }
      }),
    )
    return refs.length ? [{ name: name.trim(), refs }] : []
  })
}

/** Relations that place others above, beside or below an entity in its family. */
const KIN: [row: "up" | "side" | "down", name: RegExp][] = [
  ["up", /^(parents?|father|mother|cha|bố|mẹ|eltern|vater|mutter|père|mère|padres?|madre|父|母|父母|親)$/i],
  ["side", /^(spouse|partner|wife|husband|siblings?|brothers?|sisters?|twin|vợ|chồng|anh|chị|em|anh chị em|ehepartner|geschwister|bruder|schwester|époux|épouse|frère|sœur|esposa?|esposo|hermanos?|hermana|配偶者|兄弟|姉妹|配偶|兄弟姐妹)$/i],
  ["down", /^(child|children|sons?|daughters?|con|con cái|kinder|kind|sohn|tochter|enfants?|fils|fille|hij[oa]s?|子|子供|子女|孩子)$/i],
]

const refHtml = (r: Ref, attrs = "") => (r.href ? `<a class="internal" href="${escapeAttr(r.href)}"${attrs}>${escapeAttr(r.text)}</a>` : escapeAttr(r.text))

/** A family tree of the relations that make one: parents above, partners and siblings beside, children below. */
export function loreTree(title: string, relations: Relation[]): string {
  const rows = { up: [] as string[], side: [] as string[], down: [] as string[] }
  for (const rel of relations) {
    const row = KIN.find(([, re]) => re.test(rel.name))?.[0]
    if (row) rows[row].push(...rel.refs.map((r) => `<li>${refHtml(r, ' tabindex="-1"')}<small>${escapeAttr(rel.name)}</small></li>`))
  }
  if (!rows.up.length && !rows.side.length && !rows.down.length) return ""
  const row = (cls: string, items: string[]) => (items.length ? `<ul class="lore-tree-row ${cls}">${items.join("")}</ul>` : "")
  return (
    `<figure class="lore-tree" aria-hidden="true">${row("is-up", rows.up)}` +
    `<ul class="lore-tree-row is-self"><li class="lore-self">${escapeAttr(title)}</li>${rows.side.join("")}</ul>${row("is-down", rows.down)}</figure>`
  )
}

/** Other lore that names a note: by the relation it names it with, then the lore that only links to it. */
export function loreLinksOf(note: Note): { relations: { name: string; notes: Note[] }[]; mentions: Note[] } {
  const groups = new Map<string, { name: string; notes: Note[] }>()
  const named = new Set<string>()
  // A protected note's relations are part of what its password guards.
  const lore = listed(note.lang).filter((n) => n.layout === "lore" && n.key !== note.key && !n.protected)
  for (const n of lore) {
    for (const rel of relationsOf(n)) {
      if (!rel.refs.some((r) => r.key === note.key)) continue
      const id = rel.name.toLowerCase()
      if (!groups.has(id)) groups.set(id, { name: rel.name, notes: [] })
      groups.get(id)!.notes.push(n)
      named.add(n.key)
    }
  }
  const back = new Set((getVault().backlinks[note.lang].get(note.key) ?? []).map((b) => b.note.key))
  return { relations: [...groups.values()], mentions: lore.filter((n) => back.has(n.key) && !named.has(n.key)) }
}

/**
 * A worldbuilding entity: after its text, its relations (and their family
 * tree), then the other lore that names it, by relation.
 */
export function loreHtml(note: Note, html: string): string {
  const s = t(note.lang)
  const relations = relationsOf(note)
  const links = loreLinksOf(note)
  const row = (dt: string, dd: string) => `<div><dt>${escapeAttr(dt)}</dt><dd>${dd}</dd></div>`
  const notes = (list: Note[]) => list.map((n) => refHtml({ text: n.title, href: n.url })).join(", ")
  const own = relations.length
    ? `<section class="lore-relations"><h2>${escapeAttr(s.loreRelations)}</h2>` +
      `<dl>${relations.map((r) => row(r.name, r.refs.map((x) => refHtml(x)).join(", "))).join("")}</dl>${loreTree(note.title, relations)}</section>`
    : ""
  const others = [...links.relations.map((g) => row(s.relationOf.replace("{relation}", g.name), notes(g.notes))), ...(links.mentions.length ? [row(s.loreMentions, notes(links.mentions))] : [])]
  const named = others.length ? `<section class="lore-links"><h2>${escapeAttr(s.loreLinks)}</h2><dl>${others.join("")}</dl></section>` : ""
  return html + own + named
}

/**
 * A note's rendered text reshaped by its layout; a recipe of a collection gets
 * its two columns. `translation` is the rendered text a poem goes beside.
 */
export function layoutHtml(note: Note, html: string, translation?: string): string {
  const s = t(note.lang)
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
    case "paper":
      return note.protected ? html : paperHtml(html, s.abstract, citeHtml(paperOf(note).entry, s.citeThis))
    case "decision":
      return decisionHtml(html)
    case "changelog": {
      const feed = note.protected ? "" : `<p class="release-feed"><a href="${escapeAttr(releasesUrl(note))}">${escapeAttr(t(note.lang).rss)}</a></p>`
      return changelogHtml(html, note.lang, feed)
    }
    case "dialogue": {
      // `speakers` lists names, or maps them to pictures.
      const raw = note.source.fm.speakers
      const names = Array.isArray(raw) ? raw.map(plain) : raw && typeof raw === "object" ? Object.keys(raw) : []
      return dialogueHtml(html, { ...Object.fromEntries(names.map((n) => [n, undefined])), ...note.speakers })
    }
    case "highlights":
      return highlightsHtml(html)
    case "glossary": {
      const { intro, entries } = glossaryEntries(html)
      return glossaryHtml(intro, [...entries, ...termNotes(note, entries)], note.lang, t(note.lang).glossaryLetters)
    }
    case "trip":
      return tripHtml(note, html)
    case "syllabus": {
      const { intro, parts } = sections(html)
      return syllabusHtml(intro, lessonsOf(note, parts), note.lang)
    }
    case "poem": {
      if (note.protected) return html
      const pair = note.translation && translation !== undefined ? note.translation : undefined
      const numbered = note.source.fm.numbered === true || String(note.source.fm.numbered).toLowerCase() === "true"
      // The original, the language the note says it is in, goes first.
      const original = typeof note.source.fm.lang === "string" ? note.source.fm.lang : note.sourceLang
      return poemHtml(html, numbered, pair && { html: translation!, lang: pair.lang, ownLang: note.contentLang, first: pair.lang === original })
    }
    case "letter": {
      if (note.protected) return html
      const { dateline, signature } = letterFacts(note)
      return letterHtml(html, dateline, signature)
    }
    case "compare": {
      const { intro, options } = compareOf(html)
      return compareHtml(intro, options, plain(note.source.fm.pick), { pros: s.comparePros, cons: s.compareCons, summary: s.compareSummary, picked: s.comparePicked })
    }
    case "checklist":
      return checklistHtml(html, { progress: s.checklistProgress, reset: s.checklistReset })
    case "recipe-card":
      return note.protected ? html : recipeCardHtml(note, html, s.printCard)
    case "hub":
      return hubHtml(note.title, html)
    case "lore":
      return note.protected ? html : loreHtml(note, html)
    case undefined:
      return collectionKindOf(note) === "recipes" ? recipeHtml(html) : html
    default:
      // A collection lists what its base finds itself.
      return isCollection(note.layout) ? withoutBases(html) : html
  }
}
