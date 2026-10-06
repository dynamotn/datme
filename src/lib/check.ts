import { site } from "../site.config"
import { getVault, type Problem } from "./vault"
import { externalUrls } from "./links"

/** Every problem of the vault and of datme.yaml, sorted by file. */
export function checkVault(): Problem[] {
  const vault = getVault()
  const problems = [...vault.problems]
  for (const item of site.nav) {
    if (item.kind !== "note") continue
    const source = vault.resolveNote(item.target!, "")
    if (!source) problems.push({ level: "warning", file: "datme.yaml", message: `nav: no published note matches "${item.target}"` })
  }
  return sortProblems(problems)
}

/** External URLs of every published note in any language, with the files linking each. */
export function externalLinks(): Map<string, string[]> {
  const vault = getVault()
  const urls = new Map<string, string[]>()
  for (const lang of Object.keys(vault.notes)) {
    for (const n of vault.notes[lang]) {
      const file = n.source.key + ".md"
      for (const url of externalUrls(n.md)) {
        const files = urls.get(url) ?? []
        if (!files.includes(file)) urls.set(url, [...files, file])
      }
    }
  }
  return urls
}

/** Sort problems by file, then by severity. */
export function sortProblems(problems: Problem[]): Problem[] {
  const rank = { error: 0, warning: 1, info: 2 }
  return problems.sort((a, b) => a.file.localeCompare(b.file) || rank[a.level] - rank[b.level])
}

export interface Counts {
  error: number
  warning: number
  info: number
}

export function countProblems(problems: Problem[]): Counts {
  const counts: Counts = { error: 0, warning: 0, info: 0 }
  for (const p of problems) counts[p.level]++
  return counts
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** One line such as "2 errors, 1 warning, 3 links to unpublished notes". */
export function summarize(c: Counts): string {
  const parts = [plural(c.error, "error"), plural(c.warning, "warning")]
  if (c.info) parts.push(`${plural(c.info, "link")} to unpublished notes`)
  return parts.join(", ")
}

/** The report of `datme check`, grouped by file; links to private notes only with `verbose`. */
export function formatReport(problems: Problem[], verbose = false): string {
  const shown = verbose ? problems : problems.filter((p) => p.level !== "info")
  const lines: string[] = []
  let file = ""
  for (const p of shown) {
    if (p.file !== file) {
      file = p.file
      lines.push("", file)
    }
    lines.push(`  ${p.level.padEnd(7)} ${p.message}`)
  }
  const counts = countProblems(problems)
  lines.push("", summarize(counts))
  if (!verbose && counts.info) lines.push('Links to unpublished notes are expected in a private vault; "--verbose" lists them.')
  return lines.join("\n").replace(/^\n/, "")
}
