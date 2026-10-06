import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pruneCache } from "../src/cli"

// Builds the fixture vault twice through the CLI with a cache of its own.
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/vault")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-cache-"))
const cache = path.join(tmp, "cache")
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

function build(out: string, ...flags: string[]): number {
  const start = performance.now()
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", path.join(tmp, out), ...flags], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: cache },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
  return performance.now() - start
}

const files = (dir: string) => (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => fs.statSync(path.join(dir, f)).isFile())
const page = (out: string, p: string) => fs.readFileSync(path.join(tmp, out, p), "utf8")

describe("build cache", () => {
  test("a second build reuses rendered notes and social cards and gives the same pages", () => {
    build("first")
    const entries = files(cache)
    expect(entries.some((f) => f.startsWith("notes/"))).toBe(true)
    expect(entries.some((f) => f.startsWith("og/"))).toBe(true)
    build("second")
    expect(files(cache).sort()).toEqual(entries.sort())
    for (const p of ["03_Atomic/Zettelkasten/index.html", "07_Project/Blog-post/index.html", "en-US/index.html"]) {
      expect(page("second", p)).toBe(page("first", p))
    }
    expect(fs.readFileSync(path.join(tmp, "second/og/03_Atomic/Zettelkasten.png"))).toEqual(
      fs.readFileSync(path.join(tmp, "first/og/03_Atomic/Zettelkasten.png")),
    )
  }, 240_000)

  test("protected notes and notes that embed others are never cached", () => {
    for (const f of files(cache)) {
      const body = fs.readFileSync(path.join(cache, f), "utf8")
      expect(body.includes("Protected content")).toBe(false)
      expect(body.includes("transclude")).toBe(false)
    }
  })

  test("--fresh starts from an empty cache", () => {
    const marker = path.join(cache, "notes", "stale")
    fs.writeFileSync(marker, "")
    build("third", "--fresh")
    expect(fs.existsSync(marker)).toBe(false)
    expect(files(cache).length).toBeGreaterThan(0)
  }, 240_000)
})

describe("pruneCache", () => {
  test("drops entries older than the build and the folders they leave empty", () => {
    const dir = path.join(tmp, "prune")
    fs.mkdirSync(path.join(dir, "notes/ab"), { recursive: true })
    fs.mkdirSync(path.join(dir, "og/cd"), { recursive: true })
    fs.writeFileSync(path.join(dir, "notes/ab/old"), "")
    fs.writeFileSync(path.join(dir, "og/cd/new"), "")
    const past = new Date(Date.now() - 60_000)
    fs.utimesSync(path.join(dir, "notes/ab/old"), past, past)
    pruneCache(dir, Date.now() - 30_000)
    expect(files(dir)).toEqual([path.join("og", "cd", "new")])
    expect(fs.existsSync(path.join(dir, "notes"))).toBe(false)
  })
})
