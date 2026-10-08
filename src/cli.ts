import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseArgs as parseNodeArgs } from "node:util"
import { execFileSync } from "node:child_process"
import { TARGETS, NEXT_STEPS, deployFiles, projectName, type Target } from "./lib/deploy.ts"
import { DEAD_LINKS_FILE } from "./lib/dead-links.ts"

/** Root of the datme package, where the Astro project lives. */
export const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..")
/** Astro builds here first: it renames files out of .astro/, which fails across filesystems. */
const STAGING = path.join(PACKAGE_ROOT, ".datme", "dist")
/** Marks a directory as datme output, so a rebuild may replace it. */
const MARKER = ".datme-build"
/** Rendered notes and social cards reused by the next build, unless DATME_CACHE says otherwise. */
const CACHE = path.join(PACKAGE_ROOT, ".datme", "cache")

/** The build cache: DATME_CACHE moves it, an empty value turns it off. */
function cacheDirOf(env: NodeJS.ProcessEnv, cwd: string): string | undefined {
  return env.DATME_CACHE === undefined ? CACHE : env.DATME_CACHE ? path.resolve(cwd, env.DATME_CACHE) : undefined
}

export const USAGE = `datme: publish an Obsidian vault as a digital garden

Usage:
  datme dev     [vault] [--port 4321] [--host]   live preview, reloads on note changes
  datme build   [vault] [--out ./dist] [--fresh] build the static site (dev, build and preview take --drafts)
  datme preview [vault] [--port 4321] [--host]   build, then serve the result
  datme check   [vault] [--verbose] [--external] report broken links and other problems
                                                 (--json for tools, --privacy for what leaves the vault)
  datme url     <note> [vault] [--lang xx]       the URL path of a published note
  datme related <note> [vault] [--json]          notes related to one, and the published
                                                 notes its text names without a link
  datme init    [vault]                          write a starter datme.yaml
  datme doctor  [vault]                          check the machine and the vault before a build
  datme deploy  <host> [vault] [--branch main]   write a CI config publishing on every push
                                                 hosts: github, gitlab, netlify, cloudflare
  datme export  <folder> [vault] [--format epub|html] [--out file] [--lang xx]
                                                 a folder as an EPUB, or one page to print

The vault defaults to $DATME_VAULT, then the current directory.
Options:
  --out <dir>    output directory of build (default: ./dist)
  --site <url>   public URL of the site, overrides site.url in datme.yaml
  --port <n>     port of dev and preview
  --host         listen on every network interface
  --fresh        ignore the cache of rendered notes and social cards
  --drafts       also build drafts and scheduled notes, marked and kept out of search engines
  --strict       fail check and build on warnings too, not only on errors
  --verbose      also list notices: links to unpublished notes, scheduled notes;
                 with build, how many notes came from the cache
  --external     also check that links to other websites still answer
  --branch <b>   branch whose pushes publish the site (default: the current one)
  --format <f>   export as epub (default) or html
  --lang <l>     language of the export or url (default: the first one)
  --privacy      list what check would publish: notes, files, properties, links to
                 private notes and outside hosts
  --json         print the problems of check as JSON
  -h, --help     show this help
  -v, --version  show the version`

export type Command = "dev" | "build" | "preview" | "check" | "init" | "doctor" | "deploy" | "export" | "url" | "related" | "help" | "version"

export interface Args {
  command: Command
  vault?: string
  /** Host of `datme deploy`. */
  target?: Target
  branch?: string
  /** Folder of `datme export`, relative to the vault; "." for all of it. */
  folder?: string
  format?: "epub" | "html"
  lang?: string
  out?: string
  site?: string
  port?: number
  host?: boolean
  strict?: boolean
  verbose?: boolean
  fresh?: boolean
  drafts?: boolean
  external?: boolean
  json?: boolean
  /** `datme check --privacy`: what leaves the vault, instead of the problems. */
  privacy?: boolean
  /** Vault-relative file of `datme url` and `datme related`. */
  note?: string
}

export class CliError extends Error {
  override name = "CliError"
}

export function parseArgs(argv: string[]): Args {
  let parsed
  try {
    parsed = parseNodeArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o" },
        site: { type: "string" },
        port: { type: "string", short: "p" },
        host: { type: "boolean" },
        strict: { type: "boolean" },
        fresh: { type: "boolean" },
        drafts: { type: "boolean" },
        external: { type: "boolean" },
        json: { type: "boolean" },
        privacy: { type: "boolean" },
        branch: { type: "string", short: "b" },
        format: { type: "string", short: "f" },
        lang: { type: "string" },
        verbose: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    })
  } catch (e) {
    throw new CliError((e as Error).message)
  }
  const { values, positionals } = parsed
  if (values.help) return { command: "help" }
  if (values.version) return { command: "version" }
  const [command = "help", ...operands] = positionals
  if (!["dev", "build", "preview", "check", "init", "doctor", "deploy", "export", "url", "related", "help"].includes(command)) {
    throw new CliError(`Unknown command "${command}". Run "datme --help".`)
  }
  let target: Target | undefined
  if (command === "deploy") {
    const host = operands.shift()
    if (!TARGETS.includes(host as Target)) {
      throw new CliError(`${host ? `Unknown host "${host}"` : "Missing host"}; choose one of ${TARGETS.join(", ")}.`)
    }
    target = host as Target
  }
  let folder: string | undefined
  if (command === "export") {
    folder = operands.shift()
    if (!folder) throw new CliError('Missing folder to export; use "." for the whole vault.')
    if (values.format && values.format !== "epub" && values.format !== "html") {
      throw new CliError(`Unknown format "${values.format}"; choose epub or html.`)
    }
  }
  let note: string | undefined
  if (command === "url" || command === "related") {
    note = operands.shift()
    if (!note) throw new CliError("Missing note, as a path relative to the vault.")
  }
  const [vault, ...rest] = operands
  if (rest.length) throw new CliError(`Unexpected argument "${rest[0]}".`)
  const port = values.port === undefined ? undefined : Number(values.port)
  if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) {
    throw new CliError(`Invalid port "${values.port}".`)
  }
  return {
    command: command as Command,
    vault,
    ...(target ? { target, branch: values.branch } : {}),
    ...(folder ? { folder, format: (values.format ?? "epub") as "epub" | "html", lang: values.lang } : {}),
    ...(note ? { note, lang: values.lang } : {}),
    ...(values.json ? { json: true } : {}),
    ...(values.privacy && command === "check" ? { privacy: true } : {}),
    out: values.out,
    site: values.site,
    port,
    host: values.host,
    strict: values.strict,
    verbose: values.verbose,
    fresh: values.fresh,
    ...(values.drafts ? { drafts: true } : {}),
    ...(values.external ? { external: true } : {}),
  }
}

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p
}

export function resolveVault(arg: string | undefined, env: Record<string, string | undefined>, cwd: string): string {
  const vault = path.resolve(cwd, expandHome(arg || env.DATME_VAULT || env.VAULT_PATH || "."))
  if (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory()) {
    throw new CliError(`Vault "${vault}" is not a directory.`)
  }
  return vault
}

/**
 * Replace `out` with the staged build. Refuses to delete a directory that a
 * previous build did not create, so a mistyped --out never wipes real files.
 */
export function publishOutput(staging: string, out: string, vault: string): void {
  const resolved = path.resolve(out)
  const forbidden = [path.parse(resolved).root, os.homedir(), vault, PACKAGE_ROOT].map((p) => path.resolve(p))
  if (forbidden.includes(resolved)) throw new CliError(`Refusing to write the site into "${resolved}".`)
  if (fs.existsSync(resolved)) {
    const entries = fs.readdirSync(resolved)
    if (entries.length && !entries.includes(MARKER)) {
      throw new CliError(`"${resolved}" is not empty and was not created by datme; choose another --out.`)
    }
    fs.rmSync(resolved, { recursive: true, force: true })
  }
  fs.cpSync(staging, resolved, { recursive: true })
  fs.writeFileSync(path.join(resolved, MARKER), "This directory is replaced on every `datme build`.\n")
}

/**
 * Delete cache entries the last build did not use, so the cache never grows
 * past one build. Reads touch entries, so anything older than the build is stale.
 */
export function pruneCache(root: string, since: number): void {
  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(p)
        if (!fs.readdirSync(p).length) fs.rmdirSync(p)
      } else if (e.name !== DEAD_LINKS_FILE && fs.statSync(p).mtimeMs < since) fs.rmSync(p)
    }
  }
  walk(root)
}

function git(cwd: string, ...args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined
  } catch {
    return undefined
  }
}

/** Write the CI configuration for a host at the root of the vault's repository. */
export function deploy(target: Target, dir: string, branch?: string): void {
  // git answers with resolved paths, so the vault must be resolved too to get its place in the repository.
  const vault = fs.realpathSync(dir)
  const root = git(vault, "rev-parse", "--show-toplevel") ?? vault
  if (root === vault && !git(vault, "rev-parse", "--git-dir")) {
    console.warn(`[datme] ${vault} is not a git repository yet; CI builds need one.`)
  }
  const files = deployFiles(target, {
    vault: path.relative(root, vault) || ".",
    branch: branch ?? git(vault, "symbolic-ref", "--short", "HEAD") ?? "main",
    project: projectName(path.basename(root)),
  })
  for (const f of files) {
    const file = path.join(root, f.path)
    if (fs.existsSync(file)) throw new CliError(`${file} already exists; remove it first to regenerate it.`)
  }
  for (const f of files) {
    const file = path.join(root, f.path)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, f.content)
    console.log(`Wrote ${file}`)
  }
  console.log(NEXT_STEPS[target])
}

/** A commented datme.yaml to start from, named after the vault. */
export function starterConfig(vault: string): string {
  const name = path.basename(vault)
  return `# datme settings: https://gitlab.com/dynamo-tools/datme
site:
  title: ${JSON.stringify(name)}
  tagline: ""
  # Public URL, needed for the sitemap, RSS and social previews.
  # url: https://notes.example.com
  # author: Your name

# The first language is served at /, the others under /<lang>/.
# Mark per-language parts of a note with <!--lang:en-US--> … <!--lang:*-->.
languages: [en-US]

# explicit: only notes with \`publish: true\`; all: every note except \`publish: false\`.
publish: explicit

# Note rendered as the home page.
home: index.md

# Folders never published, on top of .obsidian, .trash, templates and private.
ignore: []

# Top-level folders shown as the maturity stage of a note. Presets:
# fleeting, literature, atomic, permanent, structure, reference, project.
stages: {}
#  Inbox: fleeting
#  Notes: { icon: "🌿", label: Evergreen }

footer: {}
#  GitHub: https://github.com/you
# poweredBy: false            # hide the "grown with datme" line
`
}

/** Run a command; returns once a build finishes, or never for dev and preview. */
/**
 * Runs Astro from the package root. An outDir outside the working directory
 * makes Astro prerender into <cwd>/.astro and rename from there, which fails
 * with EXDEV when the package sits on another filesystem (bunx under /tmp).
 */
export async function inPackage<T>(fn: () => Promise<T>): Promise<T> {
  const cwd = process.cwd()
  process.chdir(PACKAGE_ROOT)
  try {
    return await fn()
  } finally {
    process.chdir(cwd)
  }
}

export async function run(args: Args, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Promise<void> {
  if (args.command === "help") return void console.log(USAGE)
  if (args.command === "version") {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"))
    return void console.log(pkg.version)
  }

  const vault = resolveVault(args.vault, env, cwd)
  if (args.command === "init") {
    const file = path.join(vault, "datme.yaml")
    if (fs.existsSync(file)) throw new CliError(`${file} already exists.`)
    fs.writeFileSync(file, starterConfig(vault))
    return void console.log(`Wrote ${file}`)
  }

  if (args.command === "deploy") return deploy(args.target!, vault, args.branch)

  // The Astro project reads the vault and its config from these at load time.
  env.DATME_VAULT = vault
  if (args.site) env.DATME_SITE_URL = args.site
  if (args.drafts) env.DATME_DRAFTS = "1"
  const out = path.resolve(cwd, args.out ?? "dist")
  const rel = path.relative(vault, out)
  // Output written inside the vault must not be scanned on the next build.
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) env.DATME_IGNORE = rel

  if (args.command === "export") {
    const { site } = await import("./site.config.ts")
    const lang = args.lang ?? site.defaultLang
    if (!site.langs.includes(lang)) throw new CliError(`Language "${lang}" is not one of ${site.langs.join(", ")}.`)
    const { exportEpub, exportHtml } = await import("./lib/export.ts")
    const name = args.folder === "." ? path.basename(vault) : path.basename(args.folder!.replace(/\/+$/, ""))
    const out = path.resolve(cwd, args.out ?? `${name}.${args.format}`)
    if (fs.existsSync(out) && fs.statSync(out).isDirectory()) throw new CliError(`"${out}" is a directory; give a file name with --out.`)
    try {
      const data = args.format === "html" ? await exportHtml(args.folder!, lang) : await exportEpub(args.folder!, lang)
      fs.writeFileSync(out, data)
    } catch (e) {
      throw new CliError((e as Error).message)
    }
    return void console.log(`Wrote ${out}`)
  }

  if (args.command === "url") {
    const { site } = await import("./site.config.ts")
    const lang = args.lang ?? site.defaultLang
    if (!site.langs.includes(lang)) throw new CliError(`Language "${lang}" is not one of ${site.langs.join(", ")}.`)
    const { getVault } = await import("./lib/vault.ts")
    const { docUrl } = await import("./lib/obsidian.ts")
    const vaultData = getVault()
    const rel = args.note!.replace(/\\/g, "/").replace(/^\/+/, "")
    const url = /\.(canvas|base|excalidraw(\.md)?)$/i.test(rel)
      ? vaultData.docs.has(rel) ? docUrl(rel, lang) : undefined
      : vaultData.byKey[lang].get(rel.replace(/\.md$/i, ""))?.url
    if (!url) throw new CliError(`"${rel}" is not published.`)
    return void console.log(url)
  }

  if (args.command === "doctor") {
    const { diagnose, formatDiagnosis } = await import("./lib/doctor.ts")
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"))
    const findings = diagnose({
      env,
      runtime: { bun: process.versions.bun, node: process.versions.node },
      engines: pkg.engines ?? {},
      resolves(name) {
        try {
          import.meta.resolve(name)
          return true
        } catch {
          return false
        }
      },
      git: () => {
        try {
          return execFileSync("git", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
        } catch {
          return undefined
        }
      },
      gitTop: (dir) => git(dir, "rev-parse", "--show-toplevel"),
    })
    console.log(formatDiagnosis(findings))
    if (findings.some((f) => f.level === "fail")) throw new CliError("doctor found something to fix.")
    return
  }

  if (args.command === "related") {
    const { site } = await import("./site.config.ts")
    const lang = args.lang ?? site.defaultLang
    if (!site.langs.includes(lang)) throw new CliError(`Language "${lang}" is not one of ${site.langs.join(", ")}.`)
    const rel = args.note!.replace(/\\/g, "/").replace(/^\/+/, "")
    if (!fs.existsSync(path.join(vault, rel))) throw new CliError(`"${rel}" is not a note of the vault.`)
    const { suggestionsFor, formatSuggestions } = await import("./lib/suggest.ts")
    const found = await suggestionsFor(rel, lang)
    return void console.log(args.json ? JSON.stringify(found) : formatSuggestions(found))
  }

  if (args.command === "check" && args.privacy) {
    const { privacyReport, formatPrivacy } = await import("./lib/check.ts")
    const report = privacyReport()
    return void console.log(args.json ? JSON.stringify(report) : formatPrivacy(report))
  }

  if (args.command === "check" || args.command === "build") {
    // Imported only now: the config module reads the vault from the environment set above.
    const { checkVault, countProblems, formatReport, summarize, externalLinks, sortProblems } = await import("./lib/check.ts")
    const problems = checkVault()
    if (args.command === "check" && args.external) {
      const { checkExternal } = await import("./lib/links.ts")
      const urls = externalLinks()
      console.log(`Checking ${urls.size} external links…`)
      const found = await checkExternal(urls)
      problems.push(...found)
      sortProblems(problems)
      // Builds point the dead ones at the Internet Archive.
      const cacheDir = cacheDirOf(env, cwd)
      if (cacheDir) {
        const { writeDeadLinks } = await import("./lib/dead-links.ts")
        writeDeadLinks(cacheDir, found.filter((p) => p.level === "warning" && p.url).map((p) => p.url!))
      }
    }
    const counts = countProblems(problems)
    const failed = counts.error > 0 || (args.strict && counts.warning > 0)
    if (args.command === "check") {
      // --json is for tools, such as the Obsidian plugin: every problem, notices included.
      console.log(args.json ? JSON.stringify({ counts, problems }) : formatReport(problems, args.verbose))
      if (failed) throw new CliError(`check failed: ${summarize(counts)}.`)
      return
    }
    // Without --strict a build only reports: a broken link should not take a garden offline.
    if (args.strict && (counts.error || counts.warning)) {
      throw new CliError(`${formatReport(problems, args.verbose)}\nBuild stopped by --strict.`)
    }
    if (counts.error || counts.warning) console.warn(`[datme] ${summarize(counts)}; run "datme check" for details`)
  }

  const astro = await import("astro")
  const server = { port: args.port, host: args.host }
  if (args.command === "dev") {
    env.DATME_DEV = "1"
    await astro.dev({ root: PACKAGE_ROOT, server })
    return
  }
  // An empty DATME_CACHE turns the cache off; a path moves it, e.g. somewhere CI keeps between runs.
  const cacheDir = cacheDirOf(env, cwd)
  if (cacheDir) {
    if (args.fresh) fs.rmSync(cacheDir, { recursive: true, force: true })
    env.DATME_CACHE = cacheDir
    env.DATME_VERSION = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")).version
  }
  // Filesystems keep coarse timestamps; a second of slack never prunes an entry this build used.
  const started = Date.now() - 1000
  await inPackage(() => astro.build({ root: PACKAGE_ROOT, outDir: STAGING }))
  if (cacheDir) pruneCache(cacheDir, started)
  if (args.command === "build") {
    publishOutput(STAGING, out, vault)
    console.log(`Site written to ${out}`)
    if (args.verbose) {
      const { cacheStats, formatCacheStats } = await import("./lib/render-cache.ts")
      console.log(formatCacheStats(cacheStats()))
    }
    return
  }
  await astro.preview({ root: PACKAGE_ROOT, outDir: STAGING, server })
}
