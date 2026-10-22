/**
 * `datme migrate`: switch a vault published with Obsidian Publish, the
 * Digital Garden plugin or Quartz to datme. Frontmatter keys are renamed in
 * place, line by line, so the rest of each file stays exactly as it was;
 * settings go into datme.yaml, never over a key it already has.
 */
import fs from "node:fs"
import path from "node:path"
import { dump as dumpYaml, load as loadYaml } from "js-yaml"
import { parseYaml } from "./yaml.ts"
import { CONFIG_FILES } from "./config-files.ts"

export const SOURCES = ["publish", "digital-garden", "quartz"] as const
export type Source = (typeof SOURCES)[number]

export interface NoteChange {
  /** Vault-relative path of the note. */
  file: string
  /** What changes, in words: "dg-publish → publish". */
  changes: string[]
  /** The note's new text. */
  text: string
}

export interface Plan {
  notes: NoteChange[]
  /** Settings for datme.yaml, as nested keys. */
  config: Record<string, unknown>
  /** Things to know or to do by hand. */
  notices: string[]
}

/** Frontmatter keys renamed as they are, per source; the value keeps its form. */
const RENAMES: Record<Source, Record<string, string>> = {
  publish: { cover: "banner", image: "banner" },
  "digital-garden": { "dg-publish": "publish", "dg-permalink": "permalink", "dg-hide": "unlisted" },
  quartz: {},
}

/** Keys of the Digital Garden plugin datme does without; they are left in place and listed once. */
const DG_UNUSED = /^dg-/

/** Folders datme never publishes anyway, so ignore patterns naming them need not be carried over. */
const IGNORED_ANYWAY = new Set([".git", ".obsidian", ".trash", "node_modules", "private", "templates"])

const SKIP_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules"])

function markdownFiles(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...markdownFiles(full, base))
    else if (entry.name.endsWith(".md")) out.push(path.relative(base, full).split(path.sep).join("/"))
  }
  return out.sort()
}

/** The frontmatter lines of a note and where they end, or undefined without frontmatter. */
function frontmatter(text: string): { lines: string[]; end: number } | undefined {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return undefined
  const lines = text.split(/\r?\n/)
  const end = lines.indexOf("---", 1)
  return end > 0 ? { lines, end } : undefined
}

const TOP_KEY = /^([A-Za-z0-9_-][\w-]*)\s*:(.*)$/

/**
 * A note's frontmatter migrated: renamed keys, and keys whose values carry a
 * setting, handed to `onKey` and removed when it returns true.
 */
export function migrateNote(text: string, source: Source, onKey: (key: string, value: unknown) => boolean = () => false): { text: string; changes: string[] } {
  const fm = frontmatter(text)
  if (!fm) return { text, changes: [] }
  const renames = RENAMES[source]
  const present = new Set(fm.lines.slice(1, fm.end).flatMap((l) => l.match(TOP_KEY)?.[1] ?? []))
  const changes: string[] = []
  const kept: string[] = []
  for (let i = 1; i < fm.end; i++) {
    const line = fm.lines[i]
    const m = line.match(TOP_KEY)
    if (!m) {
      kept.push(line)
      continue
    }
    const [, key, rest] = m
    let value: unknown
    try {
      value = loadYaml(rest.trim() || "null")
    } catch {
      value = rest.trim()
    }
    if (onKey(key, value)) {
      changes.push(`${key} → datme.yaml`)
      // A removed key takes its indented continuation lines with it.
      while (i + 1 < fm.end && /^\s+\S|^\s*-\s/.test(fm.lines[i + 1])) i++
      continue
    }
    const to = renames[key]
    if (to && !present.has(to)) {
      kept.push(`${to}:${rest}`)
      present.add(to)
      changes.push(`${key} → ${to}`)
    } else kept.push(line)
  }
  if (!changes.length) return { text, changes }
  const lines = [fm.lines[0], ...kept, ...fm.lines.slice(fm.end)]
  return { text: lines.join(text.includes("\r\n") ? "\r\n" : "\n"), changes }
}

/** Settings of a Quartz site, read from quartz.config.ts next to the vault or in its parent. */
export function quartzSettings(vault: string): { config: Record<string, unknown>; notices: string[] } {
  const file = [path.join(vault, "quartz.config.ts"), path.join(vault, "..", "quartz.config.ts")].find((f) => fs.existsSync(f))
  const config: Record<string, unknown> = {}
  const notices: string[] = []
  if (!file) {
    notices.push("No quartz.config.ts found next to the vault or above it: set site.title and site.url in datme.yaml.")
    // Quartz publishes every note unless told otherwise.
    config.publish = "all"
    return { config, notices }
  }
  const src = fs.readFileSync(file, "utf8")
  const str = (key: string) => src.match(new RegExp(`\\b${key}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`))?.[1]
  const site: Record<string, string> = {}
  const title = str("pageTitle")
  if (title) site.title = title
  const base = str("baseUrl")
  if (base) site.url = /^https?:\/\//.test(base) ? base : `https://${base}`
  if (Object.keys(site).length) config.site = site
  const locale = str("locale")
  if (locale) config.languages = [locale]
  const ignore = src.match(/ignorePatterns\s*:\s*\[([^\]]*)\]/)?.[1]
  const patterns = [...(ignore ?? "").matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]).filter((p) => !IGNORED_ANYWAY.has(p))
  const folders = patterns.filter((p) => !/[*?[]/.test(p))
  if (folders.length) config.ignore = folders
  const globs = patterns.filter((p) => /[*?[]/.test(p))
  if (globs.length) notices.push(`ignorePatterns ${globs.join(", ")} are globs: datme ignores folders, so list them in ignore by hand.`)
  // With the ExplicitPublish plugin only notes marked publish: true go out, as in datme by default.
  if (!/ExplicitPublish/.test(src)) config.publish = "all"
  return { config, notices }
}

/** What migrating a vault from a source would change. */
export function planMigration(vault: string, source: Source): Plan {
  const plan: Plan = { notes: [], config: {}, notices: [] }
  const unused = new Set<string>()
  for (const file of markdownFiles(vault)) {
    const text = fs.readFileSync(path.join(vault, file), "utf8")
    const { text: next, changes } = migrateNote(text, source, (key, value) => {
      // The Digital Garden plugin marks its home note; datme names it in datme.yaml.
      if (source === "digital-garden" && key === "dg-home") {
        if (value === true) plan.config.home = file
        return true
      }
      if (source === "digital-garden" && DG_UNUSED.test(key) && !RENAMES[source][key]) unused.add(key)
      return false
    })
    if (changes.length) plan.notes.push({ file, changes, text: next })
  }
  if (unused.size) plan.notices.push(`Left as they are, datme does not use them: ${[...unused].sort().join(", ")}.`)
  if (source === "publish") {
    if (fs.existsSync(path.join(vault, "publish.css"))) plan.config.theme = { css: "publish.css" }
    plan.notices.push("Obsidian Publish's publish: true is datme's own: published notes stay published.")
  }
  if (source === "quartz") {
    const q = quartzSettings(vault)
    Object.assign(plan.config, q.config)
    plan.notices.push(...q.notices)
  }
  return plan
}

/** The datme.yaml of a vault, if it has one. */
function configFile(vault: string): string | undefined {
  return CONFIG_FILES.map((f) => path.join(vault, f)).find((f) => fs.existsSync(f))
}

/**
 * The plan's settings that datme.yaml can take: all of them for a new file;
 * for an existing one, top-level keys it lacks. The rest is for the author.
 */
export function configAddition(vault: string, config: Record<string, unknown>): { add: Record<string, unknown>; skipped: string[] } {
  const file = configFile(vault)
  const text = file ? fs.readFileSync(file, "utf8") : ""
  const existing = (parseYaml(text) as Record<string, unknown> | null) ?? {}
  const add: Record<string, unknown> = {}
  const skipped: string[] = []
  for (const [key, value] of Object.entries(config)) {
    if (key in existing) skipped.push(`${key}: ${JSON.stringify(value)}`)
    else add[key] = value
  }
  return { add, skipped }
}

/** Apply a plan: rewrite the notes and add the settings to datme.yaml. */
export function applyMigration(vault: string, plan: Plan): void {
  for (const n of plan.notes) fs.writeFileSync(path.join(vault, n.file), n.text)
  const { add } = configAddition(vault, plan.config)
  if (!Object.keys(add).length) return
  const file = configFile(vault) ?? path.join(vault, "datme.yaml")
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
  const block = `# Added by datme migrate\n${dumpYaml(add, { lineWidth: -1 })}`
  fs.writeFileSync(file, before ? `${before.replace(/\n*$/, "\n")}\n${block}` : block)
}

/** The plan in words, for the terminal. */
export function describePlan(vault: string, plan: Plan, written: boolean): string {
  const lines: string[] = []
  lines.push(plan.notes.length ? `Notes (${plan.notes.length}):` : "No note needs changing.")
  for (const n of plan.notes) lines.push(`  ${n.file}: ${n.changes.join(", ")}`)
  const { add, skipped } = configAddition(vault, plan.config)
  if (Object.keys(add).length) {
    lines.push(`${path.basename(configFile(vault) ?? "datme.yaml")}:`)
    lines.push(
      ...dumpYaml(add, { lineWidth: -1 })
        .trimEnd()
        .split("\n")
        .map((l) => `  + ${l}`),
    )
  }
  if (skipped.length) lines.push("Already set in datme.yaml, left as they are (change them by hand if needed):", ...skipped.map((s) => `  ${s}`))
  for (const n of plan.notices) lines.push(`Note: ${n}`)
  lines.push(written ? "Done." : 'Nothing was written: run again with "--write" to apply.')
  return lines.join("\n")
}
