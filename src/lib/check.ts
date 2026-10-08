import { site } from "../site.config"
import { getVault, type PrivateLinkUse, type Problem } from "./vault"
import { externalUrls } from "./links"
import { docUrl } from "./obsidian"
import { noteProperties } from "./properties"
import { outsideHosts, type Host } from "./privacy"
import { parseLocation } from "./places"
import { MONO_FONT_CSS } from "./fonts"

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

/** One line such as "2 errors, 1 warning, 3 notices". */
export function summarize(c: Counts): string {
  const parts = [plural(c.error, "error"), plural(c.warning, "warning")]
  if (c.info) parts.push(plural(c.info, "notice"))
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
  if (!verbose && counts.info) lines.push('Notices (links to unpublished notes, scheduled notes) are expected; "--verbose" lists them.')
  return lines.join("\n").replace(/^\n/, "")
}

/** Everything that leaves the vault when the site is built, for `datme check --privacy`. */
export interface PrivacyReport {
  notes: { file: string; url: string; protected: boolean; unlisted: boolean }[]
  /** Canvases, bases and drawings published as pages. */
  docs: { file: string; url: string }[]
  /** Vault files copied to the site. */
  files: string[]
  /** Frontmatter keys shown in the properties block of notes, with the notes showing each. */
  properties: { key: string; files: string[] }[]
  privateLinks: PrivateLinkUse[]
  hosts: Host[]
}

export function privacyReport(): PrivacyReport {
  const vault = getVault()
  const lang = site.defaultLang
  const notes = vault.notes[lang]
  const byKey = new Map<string, string[]>()
  const embedded: string[] = []
  for (const n of notes) {
    if (n.protected) continue
    for (const [key] of noteProperties(n)) byKey.set(key, [...(byKey.get(key) ?? []), n.key + ".md"])
    for (const m of n.md.matchAll(/\bsrc="(https:\/\/[^"]+)"/g)) embedded.push(m[1])
  }
  const hasMap = notes.some((n) => !n.protected && parseLocation(n.source.fm.location ?? n.source.fm.coordinates))
  return {
    notes: notes
      .map((n) => ({ file: n.key + ".md", url: n.url, protected: n.protected, unlisted: n.unlisted }))
      .sort((a, b) => a.file.localeCompare(b.file)),
    docs: [...vault.docs.keys()].sort().map((file) => ({ file, url: docUrl(file, lang) })),
    files: [...vault.assets].sort(),
    properties: [...byKey].map(([key, files]) => ({ key, files })).sort((a, b) => a.key.localeCompare(b.key)),
    privateLinks: [...vault.privateLinks].sort((a, b) => a.file.localeCompare(b.file) || a.target.localeCompare(b.target)),
    hosts: outsideHosts(site, MONO_FONT_CSS, embedded, hasMap),
  }
}

/** The report of `datme check --privacy`, one section per kind of thing published. */
export function formatPrivacy(r: PrivacyReport): string {
  const out: string[] = []
  const section = (title: string, lines: string[]) => {
    out.push("", `${title} (${lines.length})`)
    out.push(...(lines.length ? lines.map((l) => `  ${l}`) : ["  none"]))
  }
  section(
    "Published notes",
    r.notes.map((n) => `${n.file}  ${n.url}${n.protected ? "  [password]" : ""}${n.unlisted ? "  [unlisted]" : ""}`),
  )
  section("Canvases, bases and drawings", r.docs.map((d) => `${d.file}  ${d.url}`))
  section("Files copied", r.files)
  section(
    "Properties shown",
    r.properties.map((p) => `${p.key}: ${p.files.length === 1 ? p.files[0] : `${p.files.length} notes`}`),
  )
  section(
    "Links to private notes",
    r.privateLinks.map((l) => `${l.file}  "${l.target}" ${l.shown ? `shows "${l.shown}"` : "shows nothing"}`),
  )
  section("Outside hosts", r.hosts.map((h) => `${h.host}  ${h.why}`))
  return out.join("\n").replace(/^\n/, "")
}
