import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseArgs as parseNodeArgs } from "node:util"

/** Root of the datme package, where the Astro project lives. */
export const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..")
/** Astro builds here first: it renames files out of .astro/, which fails across filesystems. */
const STAGING = path.join(PACKAGE_ROOT, ".datme", "dist")
/** Marks a directory as datme output, so a rebuild may replace it. */
const MARKER = ".datme-build"

export const USAGE = `datme: publish an Obsidian vault as a digital garden

Usage:
  datme dev     [vault] [--port 4321] [--host]   live preview, reloads on note changes
  datme build   [vault] [--out ./dist]           build the static site
  datme preview [vault] [--port 4321] [--host]   build, then serve the result
  datme check   [vault] [--verbose]              report broken links and other problems
  datme init    [vault]                          write a starter datme.yaml

The vault defaults to $DATME_VAULT, then the current directory.
Options:
  --out <dir>    output directory of build (default: ./dist)
  --site <url>   public URL of the site, overrides site.url in datme.yaml
  --port <n>     port of dev and preview
  --host         listen on every network interface
  --strict       fail check and build on warnings too, not only on errors
  --verbose      also list links to unpublished notes
  -h, --help     show this help
  -v, --version  show the version`

export type Command = "dev" | "build" | "preview" | "check" | "init" | "help" | "version"

export interface Args {
  command: Command
  vault?: string
  out?: string
  site?: string
  port?: number
  host?: boolean
  strict?: boolean
  verbose?: boolean
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
  const [command = "help", vault, ...rest] = positionals
  if (!["dev", "build", "preview", "check", "init", "help"].includes(command)) {
    throw new CliError(`Unknown command "${command}". Run "datme --help".`)
  }
  if (rest.length) throw new CliError(`Unexpected argument "${rest[0]}".`)
  const port = values.port === undefined ? undefined : Number(values.port)
  if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) {
    throw new CliError(`Invalid port "${values.port}".`)
  }
  return {
    command: command as Command,
    vault,
    out: values.out,
    site: values.site,
    port,
    host: values.host,
    strict: values.strict,
    verbose: values.verbose,
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
`
}

/** Run a command; returns once a build finishes, or never for dev and preview. */
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

  // The Astro project reads the vault and its config from these at load time.
  env.DATME_VAULT = vault
  if (args.site) env.DATME_SITE_URL = args.site
  const out = path.resolve(cwd, args.out ?? "dist")
  const rel = path.relative(vault, out)
  // Output written inside the vault must not be scanned on the next build.
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) env.DATME_IGNORE = rel

  if (args.command === "check" || args.command === "build") {
    // Imported only now: the config module reads the vault from the environment set above.
    const { checkVault, countProblems, formatReport, summarize } = await import("./lib/check.ts")
    const problems = checkVault()
    const counts = countProblems(problems)
    const failed = counts.error > 0 || (args.strict && counts.warning > 0)
    if (args.command === "check") {
      console.log(formatReport(problems, args.verbose))
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
    await astro.dev({ root: PACKAGE_ROOT, server })
    return
  }
  await astro.build({ root: PACKAGE_ROOT, outDir: STAGING })
  if (args.command === "build") {
    publishOutput(STAGING, out, vault)
    console.log(`Site written to ${out}`)
    return
  }
  await astro.preview({ root: PACKAGE_ROOT, outDir: STAGING, server })
}
