/**
 * The parts of the benchmark that only read and compute: what each metric
 * means, the table and JSON it prints, the comparison with a baseline, and
 * what a built note page makes the browser load. `tools/bench.ts` runs the
 * builds and the dev server, and hands its numbers here.
 */
import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { intFlag } from "./bench-vault"

export type Unit = "ms" | "bytes" | "count"

/** Every metric, in the order the table lists them. Lower is better for all of them. */
export const METRICS = {
  buildColdMs: { label: "Cold build (empty cache)", unit: "ms" },
  buildWarmMs: { label: "Warm build (cache filled)", unit: "ms" },
  buildColdRss: { label: "Cold build peak RSS", unit: "bytes" },
  buildWarmRss: { label: "Warm build peak RSS", unit: "bytes" },
  devStartMs: { label: "dev: start to first note served", unit: "ms" },
  devRebuildMs: { label: "dev: save to change served", unit: "ms" },
  outputBytes: { label: "Output size", unit: "bytes" },
  outputFiles: { label: "Output files", unit: "count" },
  pageHtmlBytes: { label: "Note page: HTML", unit: "bytes" },
  pageCssBytes: { label: "Note page: stylesheets", unit: "bytes" },
  pageJsBytes: { label: "Note page: scripts (static imports)", unit: "bytes" },
  graphBytes: { label: "graph.<lang>.json (local graph)", unit: "bytes" },
  searchBytes: { label: "contentIndex.<lang>.json (search)", unit: "bytes" },
  explorerBytes: { label: "explorer.<lang>.html (file tree)", unit: "bytes" },
  tarballBytes: { label: "Packed tarball", unit: "bytes" },
  installBytes: { label: "Installed node_modules", unit: "bytes" },
} as const satisfies Record<string, { label: string; unit: Unit }>

export type Metric = keyof typeof METRICS
export type Metrics = Partial<Record<Metric, number>>

export interface BenchResult {
  version: 1
  /** The datme version benchmarked. */
  datme: string
  date: string
  machine: { platform: string; arch: string; cpu: string; cpus: number; memory: number; runtime: string }
  notes: number
  seed: number
  metrics: Metrics
  /** What went wrong without stopping the run, such as a change `datme dev` never served. */
  problems?: string[]
}

export function formatValue(value: number | undefined, unit: Unit): string {
  if (value === undefined) return "-"
  if (unit === "ms") return value >= 10000 ? `${(value / 1000).toFixed(1)} s` : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`
  if (unit === "count") return String(value)
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${value} B`
}

/** Rows of cells as a plain-text table, the first row as its header. */
function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)))
  const line = (r: string[]) => r.map((cell, c) => (c === 0 ? cell.padEnd(widths[c]!) : cell.padStart(widths[c]!))).join("  ")
  return [line(rows[0]!), widths.map((w) => "-".repeat(w)).join("  "), ...rows.slice(1).map(line)].join("\n")
}

/** The result as a table: every metric measured, with the machine it ran on. */
export function formatResult(result: BenchResult): string {
  const m = result.machine
  const rows = [["Metric", "Value"]]
  for (const [name, { label, unit }] of Object.entries(METRICS)) {
    const value = result.metrics[name as Metric]
    if (value !== undefined) rows.push([label, formatValue(value, unit)])
  }
  return [
    `datme ${result.datme}, ${result.notes} notes (seed ${result.seed}), on ${m.cpu} (${m.cpus} threads, ${formatValue(m.memory, "bytes")}), ${m.platform}/${m.arch}, ${m.runtime}`,
    "",
    table(rows),
    ...(result.problems ?? []).map((p) => `\nProblem: ${p}`),
  ].join("\n")
}

/**
 * The baseline to compare a run with: a result, or a list of results of several
 * sizes (one per `--notes`), of which the one with the same notes and seed.
 */
export function pickBaseline(data: unknown, notes: number, seed: number): BenchResult | undefined {
  const all = (Array.isArray(data) ? data : [data]) as BenchResult[]
  return all.find((r) => r?.notes === notes && r?.seed === seed && typeof r.metrics === "object")
}

export interface Row {
  metric: Metric
  base?: number
  current?: number
  /** current / base - 1; undefined when either is missing or the base is 0. */
  change?: number
  margin: number
  worse: boolean
}

/** Each metric of `current` against `base`: worse when it grew by more than its margin (a fraction: 0.15 for 15%). */
export function compare(base: BenchResult, current: BenchResult, margin = 0.15, margins: Metrics = {}): Row[] {
  return Object.keys(METRICS).flatMap((name) => {
    const metric = name as Metric
    const [b, c] = [base.metrics[metric], current.metrics[metric]]
    if (b === undefined && c === undefined) return []
    const change = b !== undefined && c !== undefined && b > 0 ? c / b - 1 : undefined
    const allowed = margins[metric] ?? margin
    return [{ metric, base: b, current: c, change, margin: allowed, worse: change !== undefined && change > allowed }]
  })
}

/** The comparison as a table, with a closing line naming the metrics that got worse. */
export function formatComparison(rows: Row[]): string {
  const cells = [["Metric", "Base", "Now", "Change", ""]]
  for (const r of rows) {
    const { label, unit } = METRICS[r.metric]
    const change = r.change === undefined ? "-" : `${r.change >= 0 ? "+" : ""}${(r.change * 100).toFixed(1)}%`
    cells.push([label, formatValue(r.base, unit), formatValue(r.current, unit), change, r.worse ? `worse (> ${Math.round(r.margin * 100)}%)` : ""])
  }
  const worse = rows.filter((r) => r.worse)
  const verdict = worse.length
    ? `${worse.length} metric(s) worse than their margin: ${worse.map((r) => r.metric).join(", ")}`
    : "No metric got worse than its margin."
  return `${table(cells)}\n\n${verdict}`
}

/** Margins from `name=percent` pairs (`devRebuildMs=30,buildColdMs=25`), as fractions. */
export function parseMargins(specs: string[]): Metrics {
  const margins: Metrics = {}
  for (const pair of specs.flatMap((s) => s.split(",")).filter(Boolean)) {
    const [name, percent] = pair.split("=")
    if (!(name! in METRICS)) throw new Error(`--margin-for: no metric named "${name}" (one of ${Object.keys(METRICS).join(", ")})`)
    const value = Number(percent)
    if (percent === undefined || percent === "" || !Number.isFinite(value) || value < 0)
      throw new Error(`--margin-for ${name} takes a percentage, not "${percent}"`)
    margins[name as Metric] = value / 100
  }
  return margins
}

export interface BenchOptions {
  notes: number
  seed: number
  json?: string
  compare?: string
  margin: number
  margins: Metrics
  dev: boolean
  install: boolean
  keep: boolean
  /** How long a build or the dev server may take, in milliseconds. */
  timeout: number
  /** How long `datme dev` may take to serve a saved change, in milliseconds. */
  devTimeout: number
}

export const BENCH_USAGE = `bun tools/bench.ts [options]
  --notes N           notes in the generated vault (default 10000)
  --seed S            seed of the generated vault (default 1)
  --json FILE         also write the result as JSON
  --compare FILE      compare with a baseline (a result, or a list of results of several sizes)
  --margin PCT        margin of every metric, in percent (default 15)
  --margin-for M=PCT  margin of one metric (repeatable, or comma-separated)
  --no-dev            skip datme dev
  --install           also pack datme and measure its installed size (slow)
  --keep              keep the vault, sites and cache
  --timeout MIN       minutes a build or the dev server may take (default 30)
  --dev-timeout SEC   seconds datme dev may take to serve a saved change (default 60)
Exits 1 when a metric is worse than its margin or something went wrong, such as a change never served.`

/** The options of `tools/bench.ts`; throws on a bad flag, or returns undefined for --help. */
export function parseBenchArgs(args: string[]): BenchOptions | undefined {
  const { values } = parseArgs({
    args,
    options: {
      notes: { type: "string" },
      seed: { type: "string" },
      json: { type: "string" },
      compare: { type: "string" },
      margin: { type: "string" },
      "margin-for": { type: "string", multiple: true },
      "no-dev": { type: "boolean" },
      install: { type: "boolean" },
      keep: { type: "boolean" },
      timeout: { type: "string" },
      "dev-timeout": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  })
  if (values.help) return undefined
  return {
    notes: intFlag("notes", values.notes, 10000, 10),
    seed: intFlag("seed", values.seed, 1),
    json: values.json,
    compare: values.compare,
    margin: intFlag("margin", values.margin, 15) / 100,
    margins: parseMargins(values["margin-for"] ?? []),
    dev: !values["no-dev"],
    install: Boolean(values.install),
    keep: Boolean(values.keep),
    timeout: intFlag("timeout", values.timeout, 30, 1) * 60_000,
    devTimeout: intFlag("dev-timeout", values["dev-timeout"], 60, 1) * 1000,
  }
}

/** What a page makes the browser fetch from the site as it loads: its scripts and stylesheets (external ones aside). */
export function pageAssets(html: string): { scripts: string[]; styles: string[] } {
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}=["']?([^"'\\s>]+)`, "i"))?.[1]
  const local = (url: string | undefined): url is string => Boolean(url) && !/^(?:[a-z]+:)?\/\//i.test(url!) && !url!.startsWith("data:")
  const scripts = new Set<string>()
  const styles = new Set<string>()
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = attr(tag, "src")
    if (local(src)) scripts.add(src)
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attr(tag, "rel")?.toLowerCase()
    const href = attr(tag, "href")
    if (!local(href)) continue
    if (rel === "stylesheet") styles.add(href)
    else if (rel === "modulepreload") scripts.add(href)
  }
  return { scripts: [...scripts], styles: [...styles] }
}

/** The modules a script imports statically (`import x from "./a.js"`, `import "./b.js"`, `export * from "./c.js"`); `import()` waits for use. */
export function staticImports(js: string): string[] {
  const found = new Set<string>()
  for (const m of js.matchAll(/\b(?:import|export)\s*(?:[\w*$\s{},]*?\bfrom\s*)?["']([^"']+)["']/g)) found.add(m[1]!)
  return [...found]
}

/** A URL of the site, relative to the page at `from`, as a file of the built site (URLs never resolve above its root). */
export function fileOf(site: string, url: string, from = "/"): string {
  return path.join(site, decodeURIComponent(new URL(url, `http://site${from}`).pathname))
}

/** The bytes of a page's stylesheets and of its scripts with everything they import statically, read from the built site. */
export function pageWeight(site: string, pageUrl: string): { html: number; css: number; js: number } {
  const page = fileOf(site, pageUrl.endsWith("/") ? `${pageUrl}index.html` : pageUrl)
  const html = fs.readFileSync(page, "utf8")
  const { scripts, styles } = pageAssets(html)
  const size = (file: string) => (fs.existsSync(file) ? fs.statSync(file).size : 0)
  const css = styles.reduce((sum, href) => sum + size(fileOf(site, href, pageUrl)), 0)
  const seen = new Set<string>()
  const queue = scripts.map((src) => fileOf(site, src, pageUrl))
  let js = 0
  while (queue.length) {
    const file = queue.shift()!
    if (seen.has(file) || !fs.existsSync(file)) continue
    seen.add(file)
    const code = fs.readFileSync(file, "utf8")
    js += Buffer.byteLength(code)
    const url = "/" + path.relative(site, file).split(path.sep).join("/")
    for (const spec of staticImports(code)) if (/^\.{0,2}\//.test(spec)) queue.push(fileOf(site, spec, url))
  }
  return { html: Buffer.byteLength(html), css, js }
}

/** The bytes and number of files under a directory, symlinks not followed. */
export function dirSize(dir: string): { bytes: number; files: number } {
  let bytes = 0
  let files = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size
    files++
  }
  return { bytes, files }
}
