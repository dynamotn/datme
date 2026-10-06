/**
 * The query language of the Obsidian Tasks plugin, one instruction per line:
 *
 *   done · not done · no|has due date (also scheduled, start)
 *   due|scheduled|starts|done before|after|on <today|tomorrow|yesterday|YYYY-MM-DD>
 *   path|description|heading includes <text> · tag includes <#tag>
 *   priority is <highest|high|medium|none|low|lowest>
 *   sort by <due|scheduled|start|done|priority|path|description> [reverse]
 *   group by <path|folder|filename|due|heading|priority> · limit <n>
 *
 * `hide …`, `show …`, `explain` and `short mode` only change the layout in
 * Obsidian and are ignored. Anything else is reported, not guessed at.
 */
import type { Task } from "./dataview"

export interface TaskItem {
  task: Task
  /** Vault-relative path of the note, with .md. */
  path: string
}

export interface TasksQuery {
  filters: ((t: TaskItem) => boolean)[]
  sort: { key: string; reverse: boolean }[]
  group?: string
  limit?: number
}

export class TasksQueryError extends Error {}

/** Priorities of the Tasks plugin, by emoji; higher sorts first. */
const PRIORITIES: [string, string, number][] = [
  ["🔺", "highest", 5],
  ["⏫", "high", 4],
  ["🔼", "medium", 3],
  ["", "none", 2],
  ["🔽", "low", 1],
  ["⏬", "lowest", 0],
]

export function priorityOf(t: Task): { name: string; rank: number } {
  const hit = PRIORITIES.find(([emoji]) => emoji && t.text.includes(emoji))
  const [, name, rank] = hit ?? PRIORITIES[3]
  return { name, rank }
}

const done = (t: Task) => t.status === "x" || t.status === "X"
const FIELD: Record<string, string> = { due: "due", scheduled: "scheduled", starts: "start", start: "start", done: "completion", created: "created" }

/** A date of a query as YYYY-MM-DD, relative words resolved against `today`. */
function day(word: string, today: Date): string {
  const w = word.trim().toLowerCase()
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  if (w === "tomorrow") d.setUTCDate(d.getUTCDate() + 1)
  else if (w === "yesterday") d.setUTCDate(d.getUTCDate() - 1)
  else if (w !== "today") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w)) throw new TasksQueryError(`unknown date "${word}"`)
    return w
  }
  return d.toISOString().slice(0, 10)
}

export function parseTasksQuery(src: string, today = new Date()): TasksQuery {
  const q: TasksQuery = { filters: [], sort: [] }
  for (const raw of src.split("\n")) {
    const line = raw.trim()
    const lower = line.toLowerCase()
    if (!line || line.startsWith("#") || /^(hide|show|explain|short mode|full mode)\b/.test(lower)) continue
    let m: RegExpMatchArray | null
    if (lower === "done") q.filters.push(({ task }) => done(task))
    else if (lower === "not done") q.filters.push(({ task }) => !done(task))
    else if ((m = lower.match(/^(no|has) (due|scheduled|start|done) date$/))) {
      const field = FIELD[m[2]]
      const want = m[1] === "has"
      q.filters.push(({ task }) => (field in task.fields) === want)
    } else if ((m = lower.match(/^(due|scheduled|starts|done|created) (before|after|on) (.+)$/))) {
      const field = FIELD[m[1]]
      const when = day(m[3], today)
      const op = m[2]
      q.filters.push(({ task }) => {
        const v = task.fields[field]
        if (!v) return false
        return op === "before" ? v < when : op === "after" ? v > when : v === when
      })
    } else if ((m = line.match(/^(path|description|heading) (does not include|includes) (.+)$/i))) {
      const what = m[1].toLowerCase()
      const needle = m[3].trim().toLowerCase()
      const negate = m[2].toLowerCase().startsWith("does not")
      q.filters.push(({ task, path }) => {
        const hay = (what === "path" ? path : what === "heading" ? (task.heading ?? "") : task.text).toLowerCase()
        return hay.includes(needle) !== negate
      })
    } else if ((m = line.match(/^tags? (does not include|includes?) #?(.+)$/i))) {
      const tag = "#" + m[2].trim().toLowerCase()
      const negate = m[1].toLowerCase().startsWith("does not")
      q.filters.push(({ task }) => task.tags.some((t) => t.toLowerCase() === tag || t.toLowerCase().startsWith(tag + "/")) !== negate)
    } else if ((m = lower.match(/^priority is (above |below )?(highest|high|medium|none|low|lowest)$/))) {
      const rank = PRIORITIES.find(([, n]) => n === m![2])![2]
      const cmp = m[1]?.trim()
      q.filters.push(({ task }) => {
        const r = priorityOf(task).rank
        return cmp === "above" ? r > rank : cmp === "below" ? r < rank : r === rank
      })
    } else if ((m = lower.match(/^sort by (due|scheduled|start|done|priority|path|description|status)( reverse)?$/))) {
      q.sort.push({ key: m[1], reverse: !!m[2] })
    } else if ((m = lower.match(/^group by (path|folder|filename|due|heading|priority|status)$/))) {
      q.group = m[1]
    } else if ((m = lower.match(/^limit (?:to )?(\d+)(?: tasks?)?$/))) {
      q.limit = Number(m[1])
    } else throw new TasksQueryError(`unsupported instruction "${line}"`)
  }
  return q
}

function sortValue(item: TaskItem, key: string): string | number {
  const { task } = item
  if (key === "priority") return -priorityOf(task).rank
  if (key === "path") return item.path
  if (key === "description") return task.text.toLowerCase()
  if (key === "status") return done(task) ? 1 : 0
  // Tasks without the date sort last, as in the plugin.
  return task.fields[FIELD[key]] ?? "9999"
}

export function groupOf(item: TaskItem, group: string): string {
  const { task, path } = item
  if (group === "path") return path.replace(/\.md$/, "")
  if (group === "folder") return path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "/"
  if (group === "filename") return path.split("/").pop()!.replace(/\.md$/, "")
  if (group === "heading") return task.heading ?? ""
  if (group === "priority") return priorityOf(task).name
  if (group === "status") return done(task) ? "Done" : "Todo"
  return task.fields.due ?? "No due date"
}

/** Matching tasks in query order; the default order is by status, then due date, then path. */
export function runTasksQuery(q: TasksQuery, items: TaskItem[]): TaskItem[] {
  let out = items.filter((i) => q.filters.every((f) => f(i)))
  const keys = q.sort.length ? q.sort : [{ key: "status", reverse: false }, { key: "due", reverse: false }, { key: "path", reverse: false }]
  out = out
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      for (const k of keys) {
        const x = sortValue(a.item, k.key)
        const y = sortValue(b.item, k.key)
        const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))
        if (d) return k.reverse ? -d : d
      }
      return a.idx - b.idx
    })
    .map((x) => x.item)
  return q.limit != null ? out.slice(0, q.limit) : out
}
