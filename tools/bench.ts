/**
 * Benchmarks datme on a generated vault (`tools/bench-vault.ts`): a cold build
 * with an empty cache and a warm one with the cache it filled, with their time
 * and peak memory; `datme dev`, from start to a note served and from saving
 * that note to the change served; the size of the site and what a note page
 * loads; and, with --install, the size of the package once installed.
 *
 * `bun tools/bench.ts --notes 1000 --json bench.json [--compare tools/bench-baseline.json]`;
 * `--help` lists the options. The pure parts live in `tools/bench-report.ts`,
 * which the tests cover; this file only runs things.
 */
import { type ChildProcess, spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import {
  BENCH_USAGE,
  type BenchOptions,
  type BenchResult,
  type Metrics,
  compare,
  dirSize,
  formatComparison,
  formatResult,
  pageWeight,
  parseBenchArgs,
  pickBaseline,
} from "./bench-report"
import { generateVault, writeVault } from "./bench-vault"
import { packAndInstall } from "./pack-check"

const root = path.resolve(import.meta.dir, "..")
const datme = path.join(root, "bin/datme.ts")
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", NO_COLOR: "1" }

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** Runs `datme build` and returns its wall time and peak RSS; the log goes to a file, printed in part on failure. */
async function build(vault: string, out: string, cache: string, log: string, timeout: number): Promise<{ ms: number; rss: number }> {
  const started = performance.now()
  const proc = Bun.spawn([process.execPath, datme, "build", vault, "--out", out], {
    cwd: root,
    env: { ...env, DATME_CACHE: cache },
    stdout: Bun.file(log),
    stderr: "pipe",
    timeout,
  })
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  const ms = performance.now() - started
  fs.appendFileSync(log, stderr)
  if (code !== 0) {
    const tail = fs.readFileSync(log, "utf8").split("\n").slice(-30).join("\n")
    throw new Error(`datme build exited with ${code ?? proc.signalCode} after ${seconds(ms)}:\n${tail}`)
  }
  // Bun reports bytes; a runtime that passes on getrusage's kilobytes (Linux) gives a value no build is small enough for.
  let rss = proc.resourceUsage()?.maxRSS ?? 0
  if (rss > 0 && rss < 10_000_000) rss *= 1024
  return { ms, rss }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })
}

/** Fetches `url` until `ok` holds for its body, and returns when; throws once `deadline` passes or the server is gone. */
async function poll(url: string, ok: (body: string) => boolean, deadline: number, server: ChildProcess): Promise<number> {
  while (performance.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`datme dev exited with ${server.exitCode}`)
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(Math.max(1000, deadline - performance.now())) })
      if (res.ok && ok(await res.text())) return performance.now()
    } catch {
      // Not listening yet, or the page failed to render: try again.
    }
    await Bun.sleep(100)
  }
  throw new Error(`${url} was not served as expected in time`)
}

/**
 * Starts `datme dev`, waits for the probe note, then edits it and waits for the
 * change to be served; `rebuildMs` is left out when it never is, within `devTimeout`.
 */
async function dev(vault: string, probe: string, log: string, timeout: number, devTimeout: number): Promise<{ startMs: number; rebuildMs?: number }> {
  const port = await freePort()
  // Astro listens on localhost, which may be ::1 only.
  const url = `http://localhost:${port}/${probe.replace(/\.md$/, "")}/`
  const out = fs.openSync(log, "w")
  const started = performance.now()
  // Its own process group, so stopping it stops whatever it started too.
  const server = spawn(process.execPath, [datme, "dev", vault, "--port", String(port)], { cwd: root, env, stdio: ["ignore", out, out], detached: true })
  const stop = () => {
    try {
      process.kill(-server.pid!, "SIGTERM")
    } catch {
      // Already gone.
    }
  }
  try {
    const served = await poll(url, (body) => body.includes("</html>"), started + timeout, server)
    const file = path.join(vault, probe)
    const marker = `bench-marker-${Date.now().toString(36)}`
    const saved = performance.now()
    fs.appendFileSync(file, `\n\nThe benchmark changed this note: ${marker}.\n`)
    const changed = await poll(url, (body) => body.includes(marker), saved + devTimeout, server).catch((error: Error) => {
      if (server.exitCode !== null) throw error
      return undefined
    })
    return { startMs: served - started, rebuildMs: changed === undefined ? undefined : changed - saved }
  } catch (error) {
    const tail = fs.readFileSync(log, "utf8").split("\n").slice(-30).join("\n")
    throw new Error(`${(error as Error).message}\n${tail}`)
  } finally {
    stop()
    fs.closeSync(out)
  }
}

function machine(): BenchResult["machine"] {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model.trim() ?? "unknown",
    cpus: os.cpus().length,
    memory: os.totalmem(),
    runtime: `Bun ${Bun.version}`,
  }
}

async function bench(options: BenchOptions): Promise<BenchResult> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "datme-bench-"))
  const vault = path.join(work, "vault")
  const metrics: Metrics = {}
  const problems: string[] = []
  try {
    const t = performance.now()
    const generated = generateVault({ notes: options.notes, seed: options.seed })
    writeVault(vault, generated)
    console.error(`Generated ${options.notes} notes in ${seconds(performance.now() - t)} at ${vault}`)

    const cache = path.join(work, "cache")
    const site = path.join(work, "site")
    console.error("Cold build, with an empty cache…")
    const cold = await build(vault, site, cache, path.join(work, "build-cold.log"), options.timeout)
    Object.assign(metrics, { buildColdMs: cold.ms, buildColdRss: cold.rss })
    console.error(`  ${seconds(cold.ms)}`)
    console.error("Warm build, with the cache of the cold one…")
    const warm = await build(vault, site, cache, path.join(work, "build-warm.log"), options.timeout)
    Object.assign(metrics, { buildWarmMs: warm.ms, buildWarmRss: warm.rss })
    console.error(`  ${seconds(warm.ms)}`)

    const output = dirSize(site)
    const page = pageWeight(site, `/${generated.probe.replace(/\.md$/, "")}/`)
    const fileSize = (rel: string) => fs.statSync(path.join(site, rel)).size
    Object.assign(metrics, {
      outputBytes: output.bytes,
      outputFiles: output.files,
      pageHtmlBytes: page.html,
      pageCssBytes: page.css,
      pageJsBytes: page.js,
      graphBytes: fileSize("static/graph.en-US.json"),
      searchBytes: fileSize("static/contentIndex.en-US.json"),
      explorerBytes: fileSize("static/explorer.en-US.html"),
    })

    if (options.dev) {
      console.error("datme dev: start, then save a note…")
      const served = await dev(vault, generated.probe, path.join(work, "dev.log"), options.timeout, options.devTimeout)
      metrics.devStartMs = served.startMs
      if (served.rebuildMs === undefined) problems.push(`datme dev did not serve a saved change to ${generated.probe} within ${seconds(options.devTimeout)}`)
      else metrics.devRebuildMs = served.rebuildMs
      console.error(
        `  first note after ${seconds(served.startMs)}, change ${served.rebuildMs === undefined ? "never served" : `after ${seconds(served.rebuildMs)}`}`,
      )
    }

    if (options.install) {
      console.error("Packing datme and installing the tarball with npm…")
      const installed = packAndInstall(path.join(work, "pack"), process.env.NODE ?? "node")
      Object.assign(metrics, { tarballBytes: installed.tarballBytes, installBytes: dirSize(path.join(installed.project, "node_modules")).bytes })
    }
  } finally {
    if (options.keep) console.error(`Kept ${work}`)
    else fs.rmSync(work, { recursive: true, force: true })
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  return {
    version: 1,
    datme: version,
    date: new Date().toISOString(),
    machine: machine(),
    notes: options.notes,
    seed: options.seed,
    metrics,
    ...(problems.length ? { problems } : {}),
  }
}

async function main(args: string[]): Promise<number> {
  const options = parseBenchArgs(args)
  if (!options) return (void console.log(BENCH_USAGE), 0)
  const result = await bench(options)
  console.log(formatResult(result))
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(result, null, 2) + "\n")
  const failed = result.problems ? 1 : 0
  if (!options.compare) return failed
  if (!fs.existsSync(options.compare)) return (void console.log(`\nNo baseline at ${options.compare}: nothing to compare with.`), failed)
  const base = pickBaseline(JSON.parse(fs.readFileSync(options.compare, "utf8")), options.notes, options.seed)
  if (!base) return (void console.log(`\n${options.compare} has no run of ${options.notes} notes (seed ${options.seed}): nothing to compare with.`), failed)
  const rows = compare(base, result, options.margin, options.margins)
  console.log(`\nAgainst ${options.compare} (datme ${base.datme}, ${base.date.slice(0, 10)}, ${base.machine.cpu}):\n`)
  console.log(formatComparison(rows))
  return rows.some((r) => r.worse) ? 1 : failed
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  console.error((error as Error).message)
  process.exitCode = 2
}
