import fs from "node:fs"
import path from "node:path"
import { site } from "../site.config"
import { isPublished, markdownFiles, parseFrontmatter } from "./vault"
import { groupVariable, splitLocked } from "./locked"

/** One line of `datme doctor`: what was looked at, and how to fix it when it is not right. */
export interface Finding {
  level: "ok" | "warn" | "fail"
  message: string
  fix?: string
}

/** What doctor needs to know of the machine, so tests can describe another one. */
export interface Machine {
  env: Record<string, string | undefined>
  /** Versions of the running Bun (if any) and Node. */
  runtime: { bun?: string; node: string }
  /** The `engines` of datme's package.json. */
  engines: { node?: string; bun?: string }
  /** Whether a package can be imported from datme. */
  resolves(pkg: string): boolean
  /** The version of git, or undefined when it is not installed. */
  git(): string | undefined
  /** The top of the git repository holding the vault, or undefined. */
  gitTop(vault: string): string | undefined
}

/** Whether a version meets a `>=x.y` requirement. */
export function meets(version: string, range: string | undefined): boolean {
  const want = range?.match(/>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!want) return true
  const have = version.replace(/^v/, "").split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    const w = Number(want[i + 1] ?? 0)
    if ((have[i] ?? 0) !== w) return (have[i] ?? 0) > w
  }
  return true
}

/** The published notes of the vault, as written: what decides the packages and passwords a build needs. */
function publishedSources(): { rel: string; fm: Record<string, unknown>; body: string }[] {
  return markdownFiles().flatMap((rel) => {
    const { fm, body } = parseFrontmatter(fs.readFileSync(path.join(site.vault, rel), "utf8"))
    return isPublished(fm, site.publish, new Date(), site.drafts) ? [{ rel, fm, body }] : []
  })
}

const fence = (body: string, lang: string) => new RegExp(`^\\s*(\`{3,}|~{3,})\\s*${lang}\\b`, "im").test(body)

/** Why a build of this vault on this machine might fail or come out poorer, each with its fix. */
export function diagnose(m: Machine): Finding[] {
  const out: Finding[] = []
  const ok = (message: string) => out.push({ level: "ok", message })
  const warn = (message: string, fix: string) => out.push({ level: "warn", message, fix })
  const fail = (message: string, fix: string) => out.push({ level: "fail", message, fix })

  if (m.runtime.bun) {
    if (meets(m.runtime.bun, m.engines.bun)) ok(`Bun ${m.runtime.bun} (needs ${m.engines.bun})`)
    else fail(`Bun ${m.runtime.bun} is too old (needs ${m.engines.bun})`, "bun upgrade")
  } else if (meets(m.runtime.node, m.engines.node)) ok(`Node ${m.runtime.node} (needs ${m.engines.node})`)
  else fail(`Node ${m.runtime.node} is too old (needs ${m.engines.node})`, "install Node 23.6 or later, or run datme with Bun: bunx @dynamotn/datme")

  const sources = publishedSources()
  const needs: [string, string][] = []
  if (sources.some((s) => fence(s.body, "d2"))) needs.push(["@terrastruct/d2", "```d2 diagrams"])
  if (sources.some((s) => fence(s.body, "typst"))) needs.push(["@myriaddreamin/typst-ts-node-compiler", "```typst blocks"])
  if (site.related.semantic) needs.push(["@huggingface/transformers", "related.semantic"])
  for (const [pkg, why] of needs) {
    if (m.resolves(pkg)) ok(`${pkg} is installed, for ${why}`)
    else fail(`${pkg} is not installed, and ${why} need it`, `bun add ${pkg}   (next to datme)`)
  }

  const git = m.git()
  const top = git ? m.gitTop(site.vault) : undefined
  if (!git) {
    const need = site.history ? fail : warn
    need("git is not installed: dates come from the file system" + (site.history ? ", and history: true needs it" : ""), "install git")
  } else if (!top) {
    const need = site.history ? fail : warn
    need(`the vault is not in a git repository: dates come from the file system${site.history ? ", and history: true needs one" : ""}`, `git -C "${site.vault}" init`)
  } else ok(`${git}, and the vault is in the repository at ${top}`)

  // Group passwords live in the environment; only the names of their variables are ever shown.
  const groups = new Map<string, Set<string>>()
  for (const s of sources) {
    const specs = [typeof s.fm.password === "string" ? s.fm.password : "", ...splitLocked(s.body).parts.map((p) => p.password)]
    for (const spec of specs) {
      const group = spec.match(/^@([\w-]+)$/)?.[1]
      if (group) groups.set(groupVariable(group), (groups.get(groupVariable(group)) ?? new Set()).add(s.rel))
    }
  }
  for (const [variable, files] of [...groups].sort()) {
    const where = files.size === 1 ? [...files][0] : `${files.size} notes`
    if (m.env[variable]) ok(`${variable} is set, for ${where}`)
    else fail(`${variable} is not set: ${where} would leave out what it protects`, `export ${variable}=…   (or add it to the CI secrets)`)
  }

  if (site.url) ok(`site.url is ${site.url}`)
  else {
    warn(
      "site.url is not set: the sitemap, RSS links, JSON-LD and social previews need the public address",
      "add `site: { url: https://… }` to datme.yaml, or pass --site <url>",
    )
  }
  return out
}

/** The report for people: one line per finding, the fix under it, and a summary. */
export function formatDiagnosis(findings: Finding[]): string {
  const mark = { ok: "✓", warn: "!", fail: "✗" }
  const lines = findings.flatMap((f) => [`${mark[f.level]} ${f.message}`, ...(f.fix ? [`    → ${f.fix}`] : [])])
  const failed = findings.filter((f) => f.level === "fail").length
  const warned = findings.filter((f) => f.level === "warn").length
  lines.push("", failed || warned ? `${failed} to fix, ${warned} to look at` : "All good.")
  return lines.join("\n")
}
