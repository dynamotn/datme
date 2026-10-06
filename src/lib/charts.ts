import { load as loadYaml, JSON_SCHEMA } from "js-yaml"
import { escapeAttr } from "./obsidian"

/** A chart of the Obsidian Charts plugin, as its YAML describes it. */
export interface ChartSpec {
  type: "bar" | "line" | "pie" | "doughnut" | "radar" | "polarArea"
  labels: string[]
  series: { title: string; data: (number | null)[] }[]
  stacked: boolean
  fill: boolean
  tension: number
  beginAtZero: boolean
  indexAxis: "x" | "y"
  /** CSS width of the chart, such as 80% or 400px. */
  width?: string
}

export class ChartError extends Error {}

const TYPES = ["bar", "line", "pie", "doughnut", "radar", "polarArea"]

export function parseChart(src: string): ChartSpec {
  let raw: unknown
  try {
    raw = loadYaml(src, { schema: JSON_SCHEMA })
  } catch (e) {
    throw new ChartError(`invalid YAML: ${(e as Error).message.split("\n")[0]}`)
  }
  if (!raw || typeof raw !== "object") throw new ChartError("expected type, labels and series")
  const c = raw as Record<string, unknown>
  const type = String(c.type ?? "bar")
  if (!TYPES.includes(type)) throw new ChartError(`unknown chart type "${type}"`)
  if (!Array.isArray(c.labels)) throw new ChartError("labels must be a list")
  if (!Array.isArray(c.series) || !c.series.length) throw new ChartError("series must be a non-empty list")
  const series = c.series.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>
    if (!Array.isArray(o.data)) throw new ChartError(`series ${i + 1} needs a data list`)
    return {
      title: String(o.title ?? `Series ${i + 1}`),
      data: o.data.map((d) => (d == null || d === "" || Number.isNaN(Number(d)) ? null : Number(d))),
    }
  })
  const width = typeof c.width === "string" && /^\d+(\.\d+)?(%|px|rem|em)$/.test(c.width) ? c.width : undefined
  return {
    type: type as ChartSpec["type"],
    labels: c.labels.map(String),
    series,
    stacked: c.stacked === true,
    fill: c.fill === true,
    tension: typeof c.tension === "number" ? Math.min(Math.max(c.tension, 0), 1) : 0,
    beginAtZero: c.beginAtZero === true,
    indexAxis: c.indexAxis === "y" ? "y" : "x",
    width,
  }
}

/**
 * The chart's placeholder: a canvas the browser draws on, and the same data
 * as a table for screen readers, printing and readers without scripts.
 */
export function renderChart(src: string): string {
  try {
    const spec = parseChart(src)
    const head = `<tr><th></th>${spec.series.map((s) => `<th scope="col">${escapeAttr(s.title)}</th>`).join("")}</tr>`
    const rows = spec.labels
      .map((l, i) => `<tr><th scope="row">${escapeAttr(l)}</th>${spec.series.map((s) => `<td>${s.data[i] ?? ""}</td>`).join("")}</tr>`)
      .join("")
    const label = spec.series.map((s) => s.title).join(", ")
    const style = spec.width ? ` style="max-width:${spec.width}"` : ""
    return `<figure class="chart"${style} data-chart="${escapeAttr(JSON.stringify(spec))}"><canvas role="img" aria-label="${escapeAttr(label)}"></canvas><table class="chart-data">${head}${rows}</table></figure>`
  } catch (e) {
    if (e instanceof ChartError) return `<p class="dataview dv-error">Chart: ${escapeAttr(e.message)}</p>`
    throw e
  }
}
