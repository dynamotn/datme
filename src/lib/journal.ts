/**
 * Daily notes, as the Daily notes core plugin and the Periodic Notes plugin
 * name them: a note per day, its path made from a date format such as
 * `YYYY-MM-DD` or `Journal/YYYY/MM/YYYY-MM-DD`. They get a /calendar page and
 * links to the previous and next day.
 */
import fs from "node:fs"
import path from "node:path"
import { site, type Lang } from "../site.config"
import { getVault, listed, type Note } from "./vault"

export interface DailyFormat {
  /** Folder of daily notes, "" for anywhere in the vault. */
  folder: string
  /** A moment.js format, as the plugins store it. */
  format: string
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
}

/** The daily note settings of the vault: Periodic Notes first, then the core plugin, then its defaults. */
export function dailyFormat(vault = site.vault): DailyFormat {
  const periodic = readJson(path.join(vault, ".obsidian/plugins/periodic-notes/data.json"))?.daily as
    | { enabled?: boolean; format?: string; folder?: string }
    | undefined
  const core = readJson(path.join(vault, ".obsidian/daily-notes.json")) as { format?: string; folder?: string } | undefined
  const pick = periodic?.enabled !== false && periodic?.format ? periodic : core
  return {
    folder: (pick?.folder ?? "").replace(/^\/+|\/+$/g, ""),
    format: pick?.format?.trim() || "YYYY-MM-DD",
  }
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]

/**
 * A matcher for the paths a moment.js format produces. Year, month and day
 * tokens are read; other tokens (weekday names, week numbers) match loosely;
 * `[text]` is literal.
 */
export function dateMatcher(format: string): (stem: string) => string | undefined {
  const groups: ("Y" | "M" | "D" | "MMM" | "MMMM")[] = []
  let re = ""
  for (const tok of format.match(/\[[^\]]*\]|YYYY|MMMM|MMM|MM|M|DDDD|DD|Do|D|dddd|ddd|dd|d|ww|w|WW|W|gggg|GGGG|.+?/g) ?? []) {
    if (tok.startsWith("[")) re += escapeRe(tok.slice(1, -1))
    else if (tok === "YYYY" || tok === "gggg" || tok === "GGGG") re += tok === "YYYY" ? (groups.push("Y"), "(\\d{4})") : "\\d{4}"
    else if (tok === "MMMM") re += (groups.push("MMMM"), "([A-Za-z]+)")
    else if (tok === "MMM") re += (groups.push("MMM"), "([A-Za-z]{3})")
    else if (tok === "MM") re += (groups.push("M"), "(\\d{2})")
    else if (tok === "M") re += (groups.push("M"), "(\\d{1,2})")
    else if (tok === "DD") re += (groups.push("D"), "(\\d{2})")
    else if (tok === "D") re += (groups.push("D"), "(\\d{1,2})")
    else if (tok === "Do") re += (groups.push("D"), "(\\d{1,2})(?:st|nd|rd|th)")
    else if (/^d{1,4}$/.test(tok)) re += "[A-Za-z]+"
    else if (/^[wW]{1,2}$/.test(tok) || tok === "DDDD") re += "\\d{1,3}"
    else re += escapeRe(tok)
  }
  const matcher = new RegExp(`^${re}$`, "i")
  return (stem) => {
    const m = stem.match(matcher)
    if (!m) return undefined
    let y = 0
    let mo = 0
    let d = 0
    groups.forEach((g, i) => {
      const v = m[i + 1]
      if (g === "Y") y = Number(v)
      else if (g === "M") mo = Number(v)
      else if (g === "D") d = Number(v)
      else mo = MONTHS.findIndex((name) => (g === "MMM" ? name.slice(0, 3) : name) === v.toLowerCase()) + 1
    })
    const date = new Date(Date.UTC(y, mo - 1, d))
    // 2024-02-30 is not a day.
    if (!y || !mo || !d || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined
    return date.toISOString().slice(0, 10)
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export interface Day {
  /** YYYY-MM-DD */
  date: string
  note: Note
}

const cache = new Map<string, Day[]>()

/** The published daily notes of a language, oldest first. */
export function journal(lang: Lang): Day[] {
  const id = `${getVault().version}:${lang}`
  let days = cache.get(id)
  if (!days) cache.set(id, (days = findDays(lang)))
  return days
}

function findDays(lang: Lang): Day[] {
  const { folder, format } = dailyFormat()
  const match = dateMatcher(format)
  const out: Day[] = []
  for (const note of listed(lang)) {
    if (note.protected) continue
    const key = note.key
    if (folder && !key.startsWith(folder + "/")) continue
    const rel = folder ? key.slice(folder.length + 1) : key
    // A format without folders names a note anywhere by its file name.
    const date = match(format.includes("/") ? rel : path.posix.basename(rel))
    if (date) out.push({ date, note })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function hasJournal(lang: Lang): boolean {
  return journal(lang).length > 0
}

/** The daily notes before and after a note, when it is one. */
export function dayNeighbours(note: Note): { day: string; prev?: Day; next?: Day } | undefined {
  const days = journal(note.lang)
  const i = days.findIndex((d) => d.note.key === note.key)
  if (i < 0) return undefined
  return { day: days[i].date, prev: days[i - 1], next: days[i + 1] }
}

export interface Month {
  year: number
  /** 1 to 12 */
  month: number
  /** Weeks from Monday; null pads the days of other months. */
  weeks: ({ day: number; note?: Note } | null)[][]
}

/** Month grids of the days, newest month first. */
export function months(days: Day[]): Month[] {
  const byMonth = new Map<string, Map<number, Note>>()
  for (const d of days) {
    const ym = d.date.slice(0, 7)
    if (!byMonth.has(ym)) byMonth.set(ym, new Map())
    byMonth.get(ym)!.set(Number(d.date.slice(8)), d.note)
  }
  return [...byMonth.keys()]
    .sort()
    .reverse()
    .map((ym) => {
      const [year, month] = ym.split("-").map(Number)
      const first = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
      const length = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const cells: ({ day: number; note?: Note } | null)[] = Array(first).fill(null)
      for (let day = 1; day <= length; day++) cells.push({ day, note: byMonth.get(ym)!.get(day) })
      while (cells.length % 7) cells.push(null)
      const weeks = []
      for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
      return { year, month, weeks }
    })
}
