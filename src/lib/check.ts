import { site } from "../site.config"
import type { Lang, SiteConfig, StyleName } from "../site.config"
import { getVault, type Note, type PrivateLinkUse, type Problem } from "./vault"
import { externalUrls } from "./links"
import { docUrl } from "./obsidian"
import { noteProperties } from "./properties"
import { outsideHosts, type Host } from "./privacy"
import { parseLocation } from "./places"
import { MONO_FONT_CSS } from "./fonts"
import { journal } from "./journal"
import { routeProblems } from "./routes"
import { AA_TEXT, contrastOf, onAccent, readableAccent } from "./contrast"
import { THEME_COLOR } from "./pwa"
import { baseStyle, lookOf } from "./look"
import { queryProblem } from "./dataview-render"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import { visit } from "unist-util-visit"
import { suggestLayouts } from "./layout-hints"
import { publishedSources } from "./doctor"
import { inGit, passwordProblems } from "./passwords"

/** How many times the median a note's links must reach to count as a hub, and the fewest links that can. */
const HUB_FACTOR = 5
const HUB_MIN = 15

/** The median of the notes that link somewhere; notes linking nowhere would pull it to zero. */
export function linkMedian(counts: number[]): number {
  const linking = counts.filter((c) => c > 0).sort((a, b) => a - b)
  return linking.length ? linking[Math.floor(linking.length / 2)] : 0
}

/** Whether a note's outgoing links make it a hub among notes of this median. */
export const isHub = (links: number, median: number) => median > 0 && links >= HUB_MIN && links >= HUB_FACTOR * median

export interface GardenShape {
  /** Notes no one links to, that neither the menu, the calendar nor the explorer leads to. */
  orphans: Note[]
  /** Notes linking to no published note. */
  deadEnds: Note[]
  /** Notes with far more links than the others, which a map of content could split. */
  hubs: { note: Note; links: number }[]
  /** Median number of outgoing links among notes that link somewhere. */
  median: number
}

/** The shape of the garden in a language: its orphans, dead ends and hubs. Daily notes are none of them. */
export function gardenShape(lang: Lang): GardenShape {
  const vault = getVault()
  const notes = vault.notes[lang]
  const backlinks = vault.backlinks[lang]
  // Notes the menu leads to are found without a link.
  const inNav = new Set(
    [...site.nav, ...site.sidebar].flatMap((item) => (item.kind === "note" ? [vault.resolveNote(item.target!, "")?.key] : [])).filter((k): k is string => !!k),
  )
  // Daily notes are reached by the calendar and from day to day, and folder notes from the explorer.
  const days = new Set(journal(lang).map((d) => d.note.key))
  const folderNotes = new Set([...vault.folders[lang].values()].flatMap((f) => (f.folderNote ? [f.folderNote.key] : [])))
  const outgoing = new Map(notes.map((n) => [n.key, new Set(n.protected ? [] : n.links.map((l) => l.key).filter((k) => k !== n.key))]))
  const median = linkMedian([...outgoing.values()].map((s) => s.size))
  const shape: GardenShape = { orphans: [], deadEnds: [], hubs: [], median }
  for (const n of notes) {
    const links = outgoing.get(n.key)!.size
    if (days.has(n.key)) continue
    if (!n.isHome && !n.unlisted && !inNav.has(n.key) && !folderNotes.has(n.key) && !(backlinks.get(n.key) ?? []).length) shape.orphans.push(n)
    if (!n.protected && links === 0) shape.deadEnds.push(n)
    if (!n.isHome && !n.isMoc && isHub(links, median)) shape.hubs.push({ note: n, links })
  }
  return shape
}

/**
 * Notices about the shape of the garden, in the default language: notes no
 * one links to (orphans), notes linking nowhere (dead ends), and notes with
 * far more links than the others (hubs, which a map of content could split).
 */
export function structureProblems(): Problem[] {
  const { orphans, deadEnds, hubs, median } = gardenShape(site.defaultLang)
  const problems: Problem[] = []
  for (const n of orphans) problems.push({ level: "info", file: n.key + ".md", message: "orphan: no published note links here, and the menu does not either" })
  for (const n of deadEnds) problems.push({ level: "info", file: n.key + ".md", message: "dead end: links to no published note" })
  for (const { note, links } of hubs) {
    problems.push({
      level: "info",
      file: note.key + ".md",
      message: `hub: links to ${links} notes, ${Math.round(links / median)} times the median of ${median}; a map of content could split it`,
    })
  }
  return problems
}

/**
 * Notices suggesting a layout, in the default language: to a note whose text
 * fits one, and to the folder note of a folder whose notes fit a collection.
 * A folder without one is named itself, with the folder note to create.
 */
export function layoutProblems(): Problem[] {
  return suggestLayouts(getVault(), site.defaultLang).map((h) => ({
    level: "info",
    file: h.create ? h.folder! : h.file,
    message: h.folder
      ? `suggested layout: ${h.layout}, listing ${h.folder}/ as a collection${h.create ? ` from a new folder note ${h.file}` : ""}: ${h.reason}`
      : `suggested layout: ${h.layout}: ${h.reason}`,
  }))
}

/** Every style a page of the site can take: the configured ones, and those its notes pick or their layouts give. */
export function stylesInUse(): StyleName[] {
  const { appearance } = site
  const configured = [
    appearance.style,
    ...Object.values(appearance.languages),
    ...appearance.schedule.map((s) => s.style),
    ...Object.values(appearance.folders),
    ...Object.values(appearance.tags),
    ...Object.values(appearance.stages),
    ...appearance.readerSwitch,
  ]
  return [...new Set([...configured, ...Object.values(getVault().notes).flatMap((notes) => notes.map(lookOf))])]
}

/** A ratio as WCAG writes it, rounded down so that a failing one never reads as passing. */
const ratioText = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}:1`

/**
 * Warnings for a `theme.accent` that WCAG AA finds too faint, as link text on the ground of a style in use
 * (light and dark; a theme pack's style on its base's), or under the text set on it; each names a nearby
 * accent that passes. `file` is where the accent is set: datme.yaml, or the theme pack's file.
 */
export function accentProblems(accent: SiteConfig["theme"]["accent"], styles: readonly StyleName[], file: string): Problem[] {
  if (!accent) return []
  const problems: Problem[] = []
  for (const scheme of ["light", "dark"] as const) {
    const color = typeof accent === "string" ? accent : accent[scheme]
    const key = typeof accent === "string" ? "theme.accent" : `theme.accent.${scheme}`
    const grounds = [...new Set(styles.map((st) => baseStyle(st)))].map((st) => ({ style: st, ground: THEME_COLOR[st][scheme] }))
    const failing = grounds.flatMap(({ style, ground }) => {
      const ratio = contrastOf(color, ground)
      return ratio !== undefined && ratio < AA_TEXT ? [{ style, ground, ratio }] : []
    })
    if (failing.length) {
      const on = failing.map((f) => `${f.style} (${ratioText(f.ratio)} on ${f.ground})`).join(", ")
      const better = readableAccent(
        color,
        failing.map((f) => f.ground),
      )
      problems.push({
        level: "warning",
        file,
        message: `${key} ${color} is too faint for text on the ${scheme} ground of ${on}: WCAG AA asks for ${AA_TEXT}:1${better ? `; ${better} passes` : ""}`,
      })
    }
    // Buttons and badges set white or near-black text on the accent, whichever reads better.
    const ink = onAccent(color)
    const onRatio = ink ? contrastOf(ink, color) : undefined
    if (ink && onRatio !== undefined && onRatio < AA_TEXT) {
      problems.push({
        level: "warning",
        file,
        message: `${key} ${color} is too mid-toned for the text set on it (${ratioText(onRatio)} with ${ink}): WCAG AA asks for ${AA_TEXT}:1; a darker or lighter accent reads better`,
      })
    }
  }
  return problems
}

/** The text of a query as a problem names it: its first line, cut short. */
export const queryText = (q: string) => {
  const line = q.trim().split("\n")[0]
  return line.length > 60 ? line.slice(0, 59) + "…" : line
}

/**
 * Dataview queries of published notes that would show an error on the page instead
 * of a result, or that datme does not support yet; in the default language.
 */
export function queryProblems(): Problem[] {
  const lang = site.defaultLang
  const problems: Problem[] = []
  for (const n of getVault().notes[lang]) {
    if (!/```dataview|`=\s/.test(n.md)) continue
    const report = (source: string, inline: boolean) => {
      const p = queryProblem(source, lang, n.key, inline)
      if (p) problems.push({ level: p.level, file: n.key + ".md", message: `Dataview ${inline ? "`= " : "`"}${queryText(source)}\`: ${p.message}` })
    }
    visit(unified().use(remarkParse).use(remarkGfm).parse(n.md), (node) => {
      if (node.type === "code" && node.lang === "dataview") report(node.value, false)
      else if (node.type === "inlineCode" && /^=\s/.test(node.value)) report(node.value.slice(1).trim(), true)
    })
  }
  return problems
}

/** Every problem of the vault and of datme.yaml, sorted by file. */
export function checkVault(): Problem[] {
  const vault = getVault()
  const accentFile = site.pack?.accent ? site.pack.file : "datme.yaml"
  const problems = [
    ...vault.problems,
    ...routeProblems(),
    ...(site.check.structure ? structureProblems() : []),
    ...(site.check.layouts ? layoutProblems() : []),
    ...accentProblems(site.theme.accent, stylesInUse(), accentFile),
    ...queryProblems(),
    ...(site.check.passwords ? passwordProblems(publishedSources(), process.env, inGit(site.vault)) : []),
  ]
  for (const [list, items] of [
    ["nav", site.nav],
    ["sidebar", site.sidebar],
  ] as const) {
    for (const item of items) {
      if (item.kind !== "note") continue
      const source = vault.resolveNote(item.target!, "")
      if (!source) problems.push({ level: "warning", file: "datme.yaml", message: `${list}: no published note matches "${item.target}"` })
    }
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
  if (!verbose && counts.info) {
    lines.push('Notices (links to unpublished notes, scheduled notes, orphans, dead ends, hubs, suggested layouts) are expected; "--verbose" lists them.')
  }
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
  /** Whether properties.show limits the keys shown to a list. */
  propertiesListed: boolean
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
    notes: notes.map((n) => ({ file: n.key + ".md", url: n.url, protected: n.protected, unlisted: n.unlisted })).sort((a, b) => a.file.localeCompare(b.file)),
    docs: [...vault.docs.keys()].sort().map((file) => ({ file, url: docUrl(file, lang) })),
    files: [...vault.assets].sort(),
    properties: [...byKey].map(([key, files]) => ({ key, files })).sort((a, b) => a.key.localeCompare(b.key)),
    propertiesListed: site.properties.show !== undefined,
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
  section(
    "Canvases, bases and drawings",
    r.docs.map((d) => `${d.file}  ${d.url}`),
  )
  section("Files copied", r.files)
  section(
    "Properties shown",
    r.properties.map((p) => `${p.key}: ${p.files.length === 1 ? p.files[0] : `${p.files.length} notes`}`),
  )
  if (r.properties.length && !r.propertiesListed) out.push("  Every key not hidden is shown; properties.show in datme.yaml shares only the keys it lists.")
  section(
    "Links to private notes",
    r.privateLinks.map((l) => `${l.file}  "${l.target}" ${l.shown ? `shows "${l.shown}"` : "shows nothing"}`),
  )
  section(
    "Outside hosts",
    r.hosts.map((h) => `${h.host}  ${h.why}`),
  )
  return out.join("\n").replace(/^\n/, "")
}
