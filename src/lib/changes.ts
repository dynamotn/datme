/**
 * How the garden is tended: every public change to a note, from its history,
 * with what grew and what was cut. Only with `history: true`, under the same
 * rules as history pages: no private versions, no commit messages.
 */
import { site, type Lang } from "../site.config"
import { listed, type Note } from "./vault"
import { diffParagraphs, historyUrl, noteVersions } from "./history"
import type { FeedScope } from "./feed"

export interface GardenChange {
  note: Note
  date: Date
  /** The first public version: the note was planted. */
  planted: boolean
  added: number
  removed: number
  /** The first paragraph that grew, as plain text, for a glimpse of the change. */
  excerpt: string
  /** Where to see it: the history page when the note has one, else the note. */
  url: string
}

/** Edits changing fewer words than this, such as typo fixes, are not worth announcing. */
export const TRIVIAL_WORDS = 3

const words = (s: string) => s.split(/\s+/).filter(Boolean)

/** Words added and removed between two texts, by longest common subsequence. */
export function wordsChanged(before: string, after: string): number {
  const a = words(before)
  const b = words(after)
  // Long rewrites are not trivial anyway: skip the quadratic count.
  if (a.length * b.length > 1_000_000) return Math.abs(a.length - b.length) + TRIVIAL_WORDS
  let prev = new Array(b.length + 1).fill(0)
  for (let i = a.length - 1; i >= 0; i--) {
    const cur = new Array(b.length + 1).fill(0)
    for (let j = b.length - 1; j >= 0; j--) cur[j] = a[i] === b[j] ? prev[j + 1] + 1 : Math.max(prev[j], cur[j + 1])
    prev = cur
  }
  return a.length + b.length - 2 * prev[0]
}

/** Markdown to a short line of plain text. */
function plain(md: string, max = 160): string {
  const text = md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, target: string, alias: string) => alias || target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~=|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}

/** Whether a note's changes may be shown: the same rules as its history page. */
const tracked = (n: Note) => site.history && !n.isHome && !n.protected && !n.draft && n.source.fm.history !== false

/** The public changes of one note, oldest first, trivial edits left out. */
export function noteChanges(note: Note): GardenChange[] {
  if (!tracked(note)) return []
  const versions = noteVersions(note)
  const out: GardenChange[] = []
  const url = versions.length > 1 ? historyUrl(note) : note.url
  for (const [i, v] of versions.entries()) {
    const before = versions[i - 1]?.text ?? ""
    const diff = diffParagraphs(before, v.text)
    const grew = diff.filter((c) => c.kind === "add")
    const cut = diff.filter((c) => c.kind === "del")
    if (i > 0 && wordsChanged(cut.map((c) => c.text).join("\n"), grew.map((c) => c.text).join("\n")) < TRIVIAL_WORDS) continue
    out.push({ note, date: v.date, planted: i === 0, added: grew.length, removed: cut.length, excerpt: plain(grew[0]?.text ?? ""), url })
  }
  return out
}

/** Notes a feed or page of changes covers. */
function notesOf(lang: Lang, scope: FeedScope): Note[] {
  const all = listed(lang)
  if (scope.kind === "folder") return all.filter((n) => n.dir === scope.dir || n.dir.startsWith(scope.dir + "/"))
  if (scope.kind === "tag") return all.filter((n) => n.tags.some((t) => t === scope.tag || t.startsWith(scope.tag + "/")))
  return all
}

/** The garden's changes, newest first. */
export function gardenChanges(lang: Lang, scope: FeedScope = { kind: "site" }, limit = 200): GardenChange[] {
  return notesOf(lang, scope)
    .flatMap(noteChanges)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit)
}

/** Whether the language has a changes page: history is on and some note has a public version. */
export const hasChanges = (lang: Lang) => site.history && listed(lang).some((n) => noteChanges(n).length > 0)

/** Monday of the week of a date, as YYYY-MM-DD in UTC: the weeks the page groups changes by. */
export function weekOf(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}
