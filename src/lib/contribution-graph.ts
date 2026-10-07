/**
 * ```contributionGraph blocks of the Contribution Graph plugin: a heatmap of
 * days, GitHub style, counting published notes (or their completed tasks) by
 * a date. The source is a Dataview source (`#tag`, `"folder"`…), the date a
 * file time or a property, the count one per note or a numeric property.
 * Heatmap Calendar, the other heatmap plugin, runs on DataviewJS and needs
 * Obsidian.
 */
import { load as loadYaml, JSON_SCHEMA } from "js-yaml"
import type { Lang } from "../site.config"
import { parseQuery, runQuery, type Engine, type Page } from "./dataview"
import { escapeAttr } from "./obsidian"
import { formatDate, t } from "./i18n"

export interface GraphOptions {
  title?: string
  from: string
  to: string
  source: string
  type: "PAGE" | "ALL_TASK" | "TASK_IN_SPECIFIC_PAGE"
  date: { type: "FILE_CTIME" | "FILE_MTIME" | "PAGE_PROPERTY"; value?: string }
  count: { type: "DEFAULT" | "PAGE_PROPERTY"; value?: string }
  rules: { color: string; min: number; max: number }[]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%]+\))$/i

/** The options of a block, with the plugin's defaults: the last 180 days of every page by creation. */
export function parseGraph(src: string, today = new Date()): GraphOptions {
  const y = (loadYaml(src, { schema: JSON_SCHEMA }) ?? {}) as Record<string, unknown>
  if (typeof y !== "object") throw new Error("expected YAML options")
  const ds = (y.dataSource ?? {}) as Record<string, unknown>
  const dateField = (ds.dateField ?? {}) as Record<string, unknown>
  const countField = (ds.countField ?? {}) as Record<string, unknown>
  let from: string
  let to: string
  if (y.dateRangeType === "FIXED_DATE_RANGE" && y.fromDate && y.toDate) {
    from = String(y.fromDate).slice(0, 10)
    to = String(y.toDate).slice(0, 10)
  } else {
    const days = Number(y.dateRangeValue) > 0 ? Number(y.dateRangeValue) : 180
    const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    to = iso(end)
    // LATEST_MONTH and LATEST_YEAR count back by those, as in the plugin.
    const unit = y.dateRangeType === "LATEST_MONTH" ? 30 : y.dateRangeType === "LATEST_YEAR" ? 365 : 1
    from = iso(new Date(end.getTime() - (days * unit - 1) * 86_400_000))
  }
  const rules = Array.isArray(y.cellStyleRules)
    ? (y.cellStyleRules as Record<string, unknown>[])
        .filter((r) => typeof r.color === "string" && COLOR.test(r.color))
        .map((r) => ({ color: r.color as string, min: Number(r.min ?? 0), max: Number(r.max ?? Infinity) }))
    : []
  const type = ds.type === "ALL_TASK" || ds.type === "TASK_IN_SPECIFIC_PAGE" ? ds.type : "PAGE"
  return {
    title: typeof y.title === "string" ? y.title : undefined,
    from,
    to,
    source: typeof ds.value === "string" ? ds.value.trim() : "",
    type,
    date: {
      type: dateField.type === "FILE_MTIME" || dateField.type === "PAGE_PROPERTY" ? dateField.type : "FILE_CTIME",
      value: typeof dateField.value === "string" ? dateField.value : undefined,
    },
    count: {
      type: countField.type === "PAGE_PROPERTY" ? "PAGE_PROPERTY" : "DEFAULT",
      value: typeof countField.value === "string" ? countField.value : undefined,
    },
    rules,
  }
}

const dayOf = (v: unknown): string | undefined => {
  if (v instanceof Date) return iso(v)
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return undefined
}

/** Counts by day, YYYY-MM-DD, with the titles that made them. */
export function graphCounts(o: GraphOptions, engine: Engine): Map<string, { count: number; titles: string[] }> {
  let pages: Page[] = engine.pages
  if (o.source) {
    const keys = new Set(
      runQuery(parseQuery(`LIST FROM ${o.source}`), engine).rows.map((r) => (r[0] as { key?: string }).key),
    )
    pages = pages.filter((p) => keys.has(p.key))
  }
  const out = new Map<string, { count: number; titles: string[] }>()
  const add = (day: string | undefined, n: number, title: string) => {
    if (!day || day < o.from || day > o.to || !(n > 0)) return
    const cell = out.get(day) ?? { count: 0, titles: [] }
    cell.count += n
    if (!cell.titles.includes(title)) cell.titles.push(title)
    out.set(day, cell)
  }
  for (const p of pages) {
    if (o.type !== "PAGE") {
      // Tasks count on the day they were done (✅ of the Tasks plugin).
      for (const task of p.tasks ?? []) if (task.status.toLowerCase() === "x") add(task.fields.completion, 1, p.title)
      continue
    }
    const day =
      o.date.type === "FILE_MTIME" ? dayOf(p.updated) : o.date.type === "PAGE_PROPERTY" ? dayOf(p.fields[o.date.value ?? ""]) : dayOf(p.created)
    const n = o.count.type === "PAGE_PROPERTY" ? Number(p.fields[o.count.value ?? ""]) : 1
    add(day, n, p.title)
  }
  return out
}

export function renderGraph(src: string, lang: Lang, engine: Engine, today = new Date()): string {
  const s = t(lang)
  let o: GraphOptions
  let counts: ReturnType<typeof graphCounts>
  try {
    o = parseGraph(src, today)
    counts = graphCounts(o, engine)
  } catch (e) {
    return `<p class="dataview dv-error">Contribution graph: ${escapeAttr((e as Error).message)}</p>`
  }
  const max = Math.max(1, ...[...counts.values()].map((c) => c.count))
  const start = new Date(`${o.from}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const end = new Date(`${o.to}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + ((7 - end.getUTCDay()) % 7))
  const cells: string[] = []
  let weeks = 0
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if ((d.getUTCDay() + 6) % 7 === 0) weeks++
    const key = iso(d)
    if (key < o.from || key > o.to) {
      cells.push('<span class="day out"></span>')
      continue
    }
    const c = counts.get(key)
    const n = c?.count ?? 0
    const rule = o.rules.find((r) => n >= r.min && n < r.max)
    const level = n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4))
    const label = `${formatDate(new Date(`${key}T12:00:00Z`), lang)}: ${n}${c ? ` · ${c.titles.join(", ")}` : ""}`
    const style = rule && n > 0 ? ` style="background:${escapeAttr(rule.color)}"` : ""
    cells.push(`<span class="day l${level}"${style} title="${escapeAttr(label)}"></span>`)
  }
  const total = [...counts.values()].reduce((a, c) => a + c.count, 0)
  return (
    `<figure class="activity contribution-graph">` +
    (o.title ? `<figcaption class="panel-title">${escapeAttr(o.title)} <span>${escapeAttr(String(total))}</span></figcaption>` : "") +
    `<div class="activity-scroll"><div class="activity-grid" role="img" aria-label="${escapeAttr(`${o.title ?? s.activity}: ${total}`)}" style="grid-template-columns: repeat(${weeks}, 1fr); min-width: ${Math.max(weeks * 14, 120)}px">` +
    cells.join("") +
    `</div></div></figure>`
  )
}
