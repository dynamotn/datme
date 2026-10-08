import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pruneCache } from "../src/cli"

// Builds a copy of the fixture vault through the CLI with a cache of its own.
const root = path.resolve(import.meta.dir, "..")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-cache-"))
const vault = path.join(tmp, "vault")
fs.cpSync(path.join(root, "tests/fixtures/vault"), vault, { recursive: true, verbatimSymlinks: true })
const cache = path.join(tmp, "cache")
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

function build(out: string, ...flags: string[]): string {
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", path.join(tmp, out), ...flags], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: cache },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
  return proc.stdout.toString()
}

const files = (dir: string) => (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => fs.statSync(path.join(dir, f)).isFile())
// Locked parts are encrypted afresh on every build, with a new salt.
const page = (out: string, p: string) =>
  fs.readFileSync(path.join(tmp, out, p), "utf8").replace(/data-payload="[^"]+"/g, 'data-payload=""')

describe("build cache", () => {
  test("a second build reuses rendered notes and social cards and gives the same pages", () => {
    build("first")
    const entries = files(cache)
    expect(entries.some((f) => f.startsWith("notes/"))).toBe(true)
    expect(entries.some((f) => f.startsWith("og/"))).toBe(true)
    build("second")
    // Nothing new is rendered; an embedded note's own entry goes once the note embedding it comes from the cache.
    const reused = files(cache)
    expect(reused.length).toBeGreaterThan(0)
    expect(reused.filter((f) => !entries.includes(f))).toEqual([])
    for (const p of ["03_Atomic/Zettelkasten/index.html", "07_Project/Blog-post/index.html", "en-US/index.html"]) {
      expect(page("second", p)).toBe(page("first", p))
    }
    expect(fs.readFileSync(path.join(tmp, "second/og/03_Atomic/Zettelkasten.png"))).toEqual(
      fs.readFileSync(path.join(tmp, "first/og/03_Atomic/Zettelkasten.png")),
    )
  }, 240_000)

  test("protected notes and locked parts are never cached, notes that embed others are", () => {
    const bodies = files(cache).map((f) => fs.readFileSync(path.join(cache, f), "utf8"))
    for (const body of bodies) {
      expect(body.includes("Protected content")).toBe(false)
      expect(body.includes("hidden treasure")).toBe(false)
    }
    expect(bodies.some((b) => b.includes('class=\\"transclude\\"'))).toBe(true)
  })

  test("a note embedding another renders again when that one changes, and --verbose counts reuse", () => {
    const zettel = path.join(vault, "03_Atomic/Zettelkasten.md")
    fs.writeFileSync(zettel, fs.readFileSync(zettel, "utf8").replace("a network of notes", "a web of cards"))
    const out = build("fourth", "--verbose")
    const embedding = page("fourth", "06_Reference/Niklas-Luhmann/index.html")
    expect(embedding).toContain("a web of cards")
    expect(embedding).not.toContain("a network of notes")
    expect(out).toMatch(/Notes: \d+ reused \(\d+ with embeds or queries\), [1-9]\d* rendered, \d+ never cached; \d+% from the cache/)
    // Nothing else changed: everything comes back from the cache.
    expect(build("fifth", "--verbose")).toMatch(/, 0 rendered,/)
  }, 240_000)

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
