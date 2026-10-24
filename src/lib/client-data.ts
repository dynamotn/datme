/**
 * The size of the data readers' browsers fetch from /static, per language:
 * the search index, the graph, the explorer… and the neighbourhood files of
 * the local graphs, for `datme build --verbose`.
 */
import fs from "node:fs"
import path from "node:path"

export interface LangData {
  lang: string
  /** Bytes of the language's files, the neighbourhood files aside. */
  total: number
  /** Its files, largest first. */
  files: { name: string; bytes: number }[]
  /** The neighbourhood files of its notes: one note page fetches one of them. */
  hoods: { count: number; total: number; largest: number }
}

/** A number of bytes as a person reads it: 999 B, 5.3 kB, 573 kB, 11.8 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const [n, unit] = bytes < 1_000_000 ? [bytes / 1000, "kB"] : [bytes / 1_000_000, "MB"]
  return `${n < 100 ? n.toFixed(1) : Math.round(n)} ${unit}`
}

const size = (file: string) => fs.statSync(file).size

/** The client data of a built site, per language: files named `<name>.<lang>.<ext>` under static/, and static/graph/<lang>/. */
export function clientDataSizes(outDir: string): LangData[] {
  const dir = path.join(outDir, "static")
  const langs = new Map<string, LangData>()
  const of = (lang: string) => {
    if (!langs.has(lang)) langs.set(lang, { lang, total: 0, files: [], hoods: { count: 0, total: 0, largest: 0 } })
    return langs.get(lang)!
  }
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []
  for (const e of entries) {
    const lang = e.name.match(/^[^.]+\.([^.]+)\.\w+$/)?.[1]
    if (e.isFile() && lang) {
      const bytes = size(path.join(dir, e.name))
      of(lang).files.push({ name: e.name, bytes })
      of(lang).total += bytes
    }
  }
  const hoodDir = path.join(dir, "graph")
  for (const lang of fs.existsSync(hoodDir) ? fs.readdirSync(hoodDir) : []) {
    const hoods = of(lang).hoods
    for (const f of fs.readdirSync(path.join(hoodDir, lang))) {
      const bytes = size(path.join(hoodDir, lang, f))
      hoods.count++
      hoods.total += bytes
      hoods.largest = Math.max(hoods.largest, bytes)
    }
  }
  for (const l of langs.values()) l.files.sort((a, b) => b.bytes - a.bytes)
  return [...langs.values()].sort((a, b) => a.lang.localeCompare(b.lang))
}

/** How many of a language's largest files are listed. */
const LISTED = 3

/** The report: each language's total, its largest files, and what one note page fetches for its local graph. */
export function formatClientData(sizes: LangData[]): string {
  if (!sizes.length) return "Client data, per language: none"
  const lines = ["Client data, per language:"]
  for (const { lang, total, files, hoods } of sizes) {
    const head = `  ${lang}: ${formatBytes(total)} in ${files.length} file${files.length === 1 ? "" : "s"}`
    lines.push(
      hoods.count
        ? `${head}; ${hoods.count} neighbourhood files for the local graph, ${formatBytes(Math.round(hoods.total / hoods.count))} on average, ${formatBytes(hoods.largest)} at most`
        : head,
    )
    for (const f of files.slice(0, LISTED)) lines.push(`    ${f.name}  ${formatBytes(f.bytes)}`)
  }
  return lines.join("\n")
}
