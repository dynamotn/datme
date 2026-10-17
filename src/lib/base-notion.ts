/**
 * The Notion-style views of the Extended Base plugin: table (stored as
 * `bases`), list, board and feed. Values that read as choices, such as lists
 * and tags, show as coloured pills; each title carries the note's icon.
 */
import type { Lang } from "../site.config"
import { formatDate, t } from "./i18n"
import { escapeAttr } from "./html"
import { html } from "./dataview-render"
import { lucideSvg } from "./icons"
import type { Link, Value } from "./dataview"
import type { Row, ViewResult } from "./bases"

interface NotionColor {
  name: string
  lightBg: string
  lightFg: string
  darkBg: string
  darkFg: string
}

/** Notion's palette, light and dark, in the plugin's order: the hash below picks from it. */
const PALETTE: NotionColor[] = [
  { name: "gray", lightBg: "#F1F1EF", lightFg: "#787774", darkBg: "#3C4144", darkFg: "#9FA4A8" },
  { name: "brown", lightBg: "#F4EEEE", lightFg: "#9E6B53", darkBg: "#4C3E35", darkFg: "#D49675" },
  { name: "orange", lightBg: "#FBEDE7", lightFg: "#C86F21", darkBg: "#553B29", darkFg: "#E98D36" },
  { name: "yellow", lightBg: "#F4F1E5", lightFg: "#B57E33", darkBg: "#4A3E2C", darkFg: "#C99D46" },
  { name: "green", lightBg: "#EDF3EB", lightFg: "#458262", darkBg: "#2F443A", darkFg: "#72B183" },
  { name: "blue", lightBg: "#E7F3F8", lightFg: "#347EA9", darkBg: "#2D4156", darkFg: "#66AADA" },
  { name: "purple", lightBg: "#F4F0F7", lightFg: "#9165B0", darkBg: "#453A5B", darkFg: "#B098D8" },
  { name: "pink", lightBg: "#F9EEF3", lightFg: "#C14C8A", darkBg: "#51384D", darkFg: "#DE84D1" },
  { name: "red", lightBg: "#FDEBEC", lightFg: "#D34C47", darkBg: "#5E3436", darkFg: "#EA878C" },
]

/** The same colour for the same value on every page, as the plugin hashes it. */
export function colorFor(text: string): NotionColor {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

type Pinned = Map<string, { color: NotionColor; opacity: number }>

const colorKey = (text: string) => text.replace(/^#/, "").toLowerCase()

/** `pinnedColors: ["done=green", "blocked=red:40"]`: a colour, and how opaque its background is. */
export function parsePinned(v: unknown): Pinned {
  const out: Pinned = new Map()
  for (const entry of Array.isArray(v) ? v : []) {
    const m = String(entry).match(/^(.*)=\s*([a-z]+)\s*(?::\s*(\d{1,3}))?\s*$/i)
    const color = m && PALETTE.find((c) => c.name === m[2].toLowerCase())
    if (m && color) out.set(colorKey(m[1].trim()), { color, opacity: Math.min(100, Number(m[3] ?? 100)) })
  }
  return out
}

/** A value as plain text: a link by its title, a date as the reader writes it. */
export function textOf(v: Value, lang: Lang): string {
  if (v == null) return ""
  if (v instanceof Date) return formatDate(v, lang)
  if (Array.isArray(v)) return v.map((x) => textOf(x, lang)).join(", ")
  if (typeof v === "object") return (v as Link).kind === "link" ? (v as Link).title : JSON.stringify(v)
  return String(v)
}

function pill(v: Value, lang: Lang, pinned: Pinned): string {
  const text = textOf(v, lang)
  if (!text) return ""
  const hit = pinned.get(colorKey(text))
  const c = hit?.color ?? colorFor(text)
  const fade = (hex: string) => (hit && hit.opacity < 100 ? `color-mix(in srgb, ${hex} ${hit.opacity}%, transparent)` : hex)
  const style = `--pill-bg:${fade(c.lightBg)};--pill-fg:${c.lightFg};--pill-bg-dark:${fade(c.darkBg)};--pill-fg-dark:${c.darkFg}`
  const link = v && typeof v === "object" && (v as Link).kind === "link" && (v as Link).url ? (v as Link) : undefined
  return link
    ? `<a class="ntn-pill internal" style="${style}" href="${escapeAttr(link.url!)}" data-key="${escapeAttr(link.key ?? "")}">${escapeAttr(text)}</a>`
    : `<span class="ntn-pill" style="${style}">${escapeAttr(text)}</span>`
}

const bare = (id: string) => id.replace(/^(note|file|formula)\./, "")

interface Ctx {
  res: ViewResult
  lang: Lang
  opts: Record<string, unknown>
  pinned: Pinned
  /** Column ids that show as pills. */
  pills: Set<string>
  names: Record<string, string>
}

function context(res: ViewResult, lang: Lang): Ctx {
  const opts = res.view.options
  const listed = new Set((Array.isArray(opts.pillProperties) ? opts.pillProperties : []).map((s) => String(s).toLowerCase().trim()))
  const overrides = record(opts.selectTypeOverride)
  const names = { ...Object.fromEntries(res.columns.map((c) => [c.id, c.name])), ...stringRecord(opts.columnNames) }
  const pills = new Set<string>()
  res.columns.forEach((c, i) => {
    if (c.id === "file.name") return
    // Lists and tags, selects, and what the view names: as the plugin tells pills from plain values.
    if (
      ["tags", "aliases"].includes(bare(c.id)) ||
      overrides[c.id] != null ||
      listed.has(bare(c.id).toLowerCase()) ||
      listed.has(names[c.id].toLowerCase()) ||
      res.rows.some((r) => Array.isArray(r.cells[i]))
    )
      pills.add(c.id)
  })
  return { res, lang, opts, pinned: parsePinned(opts.pinnedColors), pills, names }
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function stringRecord(v: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(v)).flatMap(([k, x]) => (typeof x === "string" && x ? [[k, x]] : [])))
}

function cell(ctx: Ctx, id: string, v: Value): string {
  if (!ctx.pills.has(id)) return v == null || v === "" ? "" : html(v, ctx.lang)
  return (Array.isArray(v) ? v : [v]).map((x) => pill(x, ctx.lang, ctx.pinned)).join("")
}

/** The icon at the head of a title: the note's icon property, a Lucide name or an emoji, else a page. */
function titleIcon(ctx: Ctx, row: Row): string {
  if (ctx.opts.showTitleIcon === false) return ""
  const prop = String(ctx.opts.titleIconProperty ?? "icon").trim()
  const raw = prop ? row.page.fields[prop] : undefined
  const value = raw == null ? "" : String(raw).trim()
  const svg = value ? (/^[a-z][a-z0-9-]*$/.test(value) ? lucideSvg(value) : undefined) : lucideSvg("file")
  return `<span class="ntn-page-icon" aria-hidden="true">${svg ?? escapeAttr(value)}</span>`
}

function title(ctx: Ctx, row: Row): string {
  const p = row.page
  return `<a class="ntn-title internal" href="${escapeAttr(p.url)}" data-key="${escapeAttr(p.key)}">${titleIcon(ctx, row)}<span>${escapeAttr(p.title)}</span></a>`
}

/** `rowCount: '10'`, `rowLimit: 50`; `all` or 0 shows everything. */
function pageSize(v: unknown, fallback: number): number {
  if (v == null || v === "") return fallback
  if (String(v).trim().toLowerCase() === "all") return Infinity
  const n = Number.parseInt(String(v), 10)
  return Number.isFinite(n) ? (n <= 0 ? Infinity : n) : fallback
}

/**
 * Rows past the view's page size stay in the HTML, hidden until the reader
 * asks: a checkbox styled as a button, so no script is needed.
 */
function more(hidden: number, lang: Lang): string {
  if (hidden <= 0) return ""
  return `<label class="ntn-more"><input type="checkbox">${escapeAttr(t(lang).baseShowMore.replace("{n}", String(hidden)))}</label>`
}

function columnIcon(ctx: Ctx, id: string): string {
  const name = stringRecord(ctx.opts.columnIcons)[id]
  const svg = name && lucideSvg(name)
  return svg ? `<span class="ntn-col-icon" aria-hidden="true">${svg}</span>` : ""
}

export function renderNotionTable(res: ViewResult, lang: Lang): string {
  const ctx = context(res, lang)
  const hidden = new Set((Array.isArray(ctx.opts.hiddenColumns) ? ctx.opts.hiddenColumns : []).map(String))
  const cols = res.columns.map((c, i) => ({ ...c, i })).filter((c) => !hidden.has(c.id))
  const widths = record(ctx.opts.columnWidths)
  const wrapped = new Set((Array.isArray(ctx.opts.wrapColumns) ? ctx.opts.wrapColumns : []).map(String))
  const size = pageSize(ctx.opts.rowLimit, 50)
  const colgroup = cols.some((c) => typeof widths[c.id] === "number")
    ? `<colgroup>${cols.map((c) => (typeof widths[c.id] === "number" ? `<col style="width:${Math.round(widths[c.id] as number)}px">` : "<col>")).join("")}</colgroup>`
    : ""
  const head = cols.map((c) => `<th>${columnIcon(ctx, c.id)}${escapeAttr(ctx.names[c.id])}</th>`).join("")
  const body = res.rows
    .map((r, n) => {
      const tds = cols
        .map((c) => {
          const cls = wrapped.has(c.id) ? ' class="is-wrapped"' : ""
          return `<td${cls}>${c.id === "file.name" ? title(ctx, r) : cell(ctx, c.id, r.cells[c.i])}</td>`
        })
        .join("")
      return `<tr${n >= size ? ' class="ntn-extra"' : ""}>${tds}</tr>`
    })
    .join("")
  const cls = ["ntn-table", ctx.opts.wrapCells === false ? "" : "is-wrapping", ctx.opts.verticalLines === false ? "" : "has-lines"].filter(Boolean).join(" ")
  return `<div class="ntn ntn-table-wrap"><div class="ntn-scroll"><table class="${cls}">${colgroup}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more(res.rows.length - size, lang)}</div>`
}

type Labels = "none" | "name" | "icon" | "icon-name"

/** Properties of a row other than its title, as pills or `name value` pairs. */
function properties(ctx: Ctx, row: Row, { labels = "none", pillsOnly = false }: { labels?: Labels; pillsOnly?: boolean } = {}): string {
  return ctx.res.columns
    .map((c, i) => {
      if (c.id === "file.name" || (pillsOnly && !ctx.pills.has(c.id))) return ""
      const value = cell(ctx, c.id, row.cells[i])
      if (!value) return ""
      const icon = labels === "icon" || labels === "icon-name" ? columnIcon(ctx, c.id) : ""
      const name = labels === "name" || labels === "icon-name" ? `<span class="ntn-prop-name">${escapeAttr(ctx.names[c.id])}</span>` : ""
      return `<span class="ntn-prop">${icon}${name}${value}</span>`
    })
    .join("")
}

export function renderNotionList(res: ViewResult, lang: Lang): string {
  const ctx = context(res, lang)
  const size = pageSize(ctx.opts.rowCount, 10)
  const items = res.rows
    .map((r, n) => `<li${n >= size ? ' class="ntn-extra"' : ""}>${title(ctx, r)}<span class="ntn-props">${properties(ctx, r)}</span></li>`)
    .join("")
  return `<div class="ntn ntn-list-wrap"><ul class="ntn-list">${items}</ul>${more(res.rows.length - size, lang)}</div>`
}

const WIDTHS: Record<string, number> = { small: 200, medium: 240, large: 320 }

export function renderNotionBoard(res: ViewResult, lang: Lang): string {
  const ctx = context(res, lang)
  const s = t(lang)
  const groups = res.groups ?? [{ key: null, rows: res.rows }]
  const hidden = new Set((Array.isArray(ctx.opts.hiddenGroups) ? ctx.opts.hiddenGroups : []).map(String))
  const display = String(ctx.opts.groupColorDisplay ?? "off")
  const labels = String(ctx.opts.propertyLabelDisplay ?? "none") as Labels
  const width = WIDTHS[String(ctx.opts.boardColumnWidth ?? "medium")] ?? WIDTHS.medium
  const columns = groups.map(({ key, rows }) => {
    const label = key == null ? s.baseNoGroup : textOf(key, lang)
    const c = colorFor(label)
    const tinted = key != null && (display === "background" || display === "both")
    const style = tinted ? ` style="--col-bg:${c.lightBg};--col-bg-dark:${c.darkBg}"` : ""
    const name = key != null && (display === "label" || display === "both") ? pill(label, lang, ctx.pinned) : `<span class="ntn-col-name">${escapeAttr(label)}</span>`
    const cards = rows.map((r) => `<article class="ntn-card">${title(ctx, r)}<div class="ntn-props">${properties(ctx, r, { labels })}</div></article>`).join("")
    const head = `${name}<span class="ntn-count">${rows.length}</span>`
    // Groups hidden in Obsidian fold away, still there for a reader who looks.
    return hidden.has(label) || (key == null && hidden.has("No Status"))
      ? `<details class="ntn-col is-hidden${tinted ? " is-tinted" : ""}"${style}><summary class="ntn-col-head">${head}</summary><div class="ntn-cards">${cards}</div></details>`
      : `<section class="ntn-col${tinted ? " is-tinted" : ""}"${style}><header class="ntn-col-head">${head}</header><div class="ntn-cards">${cards}</div></section>`
  })
  return `<div class="ntn ntn-board" style="--ntn-col-width:${width}px">${columns.join("")}</div>`
}

/**
 * Each note in full under its title and pills. The body is a placeholder for
 * an embed, filled in by the renderer of the page, which guards against a
 * note feeding itself.
 */
export function renderNotionFeed(res: ViewResult, lang: Lang): string {
  const ctx = context(res, lang)
  const size = pageSize(ctx.opts.rowCount, 5)
  const items = res.rows
    .map((r, n) => {
      const props = properties(ctx, r, { pillsOnly: true })
      return (
        `<article class="ntn-feed-item${n >= size ? " ntn-extra" : ""}">` +
        `<h3 class="ntn-feed-title">${title(ctx, r)}</h3>` +
        (props ? `<div class="ntn-props">${props}</div>` : "") +
        `<div class="ntn-feed-body"><span class="transclude-ph" data-key="${escapeAttr(r.page.key)}" data-fragment=""></span></div>` +
        `</article>`
      )
    })
    .join("")
  return `<div class="ntn ntn-feed">${items}${more(res.rows.length - size, lang)}</div>`
}
