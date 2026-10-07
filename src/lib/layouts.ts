import crypto from "node:crypto"
import { escapeAttr } from "./obsidian"

/**
 * Layout syntax of popular plugins, turned into HTML wrappers around markdown
 * so the content of each tab or column goes through the pipeline like the rest
 * of the note: links, embeds, callouts and code all work inside.
 *
 * Tabs (the Tabs and HTML Tabs plugins):
 *
 *   ```tabs
 *   --- First            (also `---tab First` or `tab: First`)
 *   content
 *   --- Second
 *   content
 *   ```
 *
 * Columns (the Multi-Column Markdown plugin):
 *
 *   --- start-multi-column: ID
 *   ```column-settings
 *   Number of Columns: 2
 *   ```
 *   content
 *   --- column-break ---    (also `--- column-end ---`; `===` works for `---`)
 *   content
 *   --- end-multi-column
 *
 * `> [!multi-column]` callouts holding other callouts are laid out by the
 * stylesheet alone.
 */

/** The title lines of a tab: `--- Title`, `---tab Title` or `tab: Title`. */
const TAB = /^(?:-{3}\s*(?:tab\s+)?|tab:\s*)(\S.*?)\s*$/i

export interface Tab {
  title: string
  body: string
}

/** The tabs of a ```tabs block; text before the first title is a tab of its own. */
export function parseTabs(source: string): Tab[] {
  const tabs: Tab[] = []
  let current: Tab | undefined
  let fence: string | undefined
  for (const line of source.split("\n")) {
    // A title line inside a code block of a tab is code, not a new tab.
    const f = line.match(/^\s*(`{3,}|~{3,})/)
    if (f) fence = fence === undefined ? f[1] : line.trim().startsWith(fence) ? undefined : fence
    const m = fence === undefined && !f ? line.match(TAB) : null
    if (m) {
      current = { title: m[1], body: "" }
      tabs.push(current)
    } else {
      if (!current) {
        if (!line.trim()) continue
        current = { title: "", body: "" }
        tabs.push(current)
      }
      current.body += line + "\n"
    }
  }
  return tabs
}

/** A short id stable across builds, so cached pages and links to a tab keep working. */
const idOf = (seed: string) => "tabs-" + crypto.createHash("sha1").update(seed).digest("hex").slice(0, 8)

/**
 * HTML of a ```tabs block. The tab list is built here, so the first panel
 * shows before any script runs; the others are hidden until chosen.
 */
export function tabsHtml(source: string, seed: string): string {
  const tabs = parseTabs(source)
  if (!tabs.length) return ""
  const id = idOf(seed + source)
  const buttons = tabs
    .map(
      (t, i) =>
        `<button type="button" role="tab" id="${id}-${i}" aria-controls="${id}-${i}-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${escapeAttr(t.title || String(i + 1))}</button>`,
    )
    .join("")
  const panels = tabs
    .map(
      (t, i) =>
        `<div class="tab-panel" role="tabpanel" id="${id}-${i}-panel" aria-labelledby="${id}-${i}" data-title="${escapeAttr(t.title || String(i + 1))}"${i ? " hidden" : ""}>\n\n${t.body.trim()}\n\n</div>`,
    )
    .join("\n")
  return `<div class="tabs" data-tabs>\n<div class="tab-list" role="tablist">${buttons}</div>\n${panels}\n</div>`
}

const MARK = String.raw`(?:-{3}|={3})`
const START = new RegExp(String.raw`^\s*${MARK}\s*start-multi-column\b.*$`, "im")
const BREAK = new RegExp(String.raw`^\s*${MARK}\s*(?:column-break|column-end|end-column)\s*(?:${MARK})?\s*$`, "im")
const END = new RegExp(String.raw`^\s*${MARK}\s*end-multi-column\b.*$`, "im")

/** Column count and widths read from a ```column-settings block. */
function columnSettings(settings: string): { count?: number; sizes?: string[] } {
  const field = (name: string) => settings.match(new RegExp(String.raw`^\s*${name}\s*:\s*(.+)$`, "im"))?.[1].trim()
  const count = Number(field("(?:number of columns|num of cols|col count)"))
  const raw = field("(?:column size|col size|column width|col width|widths?)")
  // `[25%, 75%]` or `small, large`; only lengths are kept.
  const sizes = raw
    ?.replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim())
  const lengths = sizes?.every((s) => /^\d+(\.\d+)?(%|px|em|rem|fr)$/.test(s)) ? sizes : undefined
  return { count: Number.isFinite(count) && count > 0 ? Math.min(count, 6) : undefined, sizes: lengths }
}

/**
 * Multi-Column Markdown regions as a grid of columns. `settingsOf` reads the
 * text of a masked code block, where the column settings hide by then.
 */
export function columnsHtml(md: string, settingsOf: (text: string) => string | undefined = () => undefined): string {
  let out = ""
  let rest = md
  for (;;) {
    const start = rest.match(START)
    if (!start || start.index === undefined) break
    const after = rest.slice(start.index + start[0].length)
    const end = after.match(END)
    if (!end || end.index === undefined) break
    let body = after.slice(0, end.index)
    // The settings block is the first thing of the region, when there is one.
    let settings = ""
    body = body.replace(/^\s*(\S[^\n]*)\n?/, (m, first: string) => {
      const text = settingsOf(first) ?? first
      if (!/^\s*(`{3,}|~{3,})\s*(?:column-settings|multi-column-settings|settings)\b/i.test(text)) return m
      settings = text
      return "\n"
    })
    const columns = body.split(new RegExp(BREAK.source, "gim"))
    const { count, sizes } = columnSettings(settings)
    // Percentages become shares of the room left by the gaps, so the columns never overflow.
    const template = sizes
      ? sizes.map((s) => (/%$/.test(s) ? `minmax(0, ${parseFloat(s)}fr)` : s)).join(" ")
      : `repeat(${count ?? columns.length}, minmax(0, 1fr))`
    out +=
      rest.slice(0, start.index) +
      `<div class="columns" style="grid-template-columns:${template}">\n` +
      columns.map((c) => `<div class="column">\n\n${c.trim()}\n\n</div>`).join("\n") +
      `\n</div>`
    rest = after.slice(end.index + end[0].length)
  }
  return out + rest
}
