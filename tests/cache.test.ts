import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { claimCache, defaultCacheOf, emptyCache, pruneCache, sweepStaging, userCacheDir } from "../src/cli"
import { DEAD_LINKS_FILE } from "../src/lib/dead-links"
import { NEIGHBOURS_FILE } from "../src/lib/neighbours"

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
const page = (out: string, p: string) => fs.readFileSync(path.join(tmp, out, p), "utf8").replace(/data-payload="[^"]+"/g, 'data-payload=""')

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

  test("an edit of datme.yaml that only changes the menus keeps every cached note and card", () => {
    const config = path.join(vault, "datme.yaml")
    const before = fs.readFileSync(config, "utf8")
    const entries = files(cache)
    try {
      fs.writeFileSync(
        config,
        before.replace("en-US: About Luhmann", "en-US: On Luhmann").replace("footer:\n", "footer:\n  Mastodon: https://mastodon.example/@tester\n"),
      )
      expect(build("menus", "--verbose")).toMatch(/, 0 rendered,/)
      expect(page("menus", "en-US/index.html")).toContain("On Luhmann")
      expect(files(cache).filter((f) => !entries.includes(f))).toEqual([])
    } finally {
      fs.writeFileSync(config, before)
    }
  }, 240_000)

  test("--fresh starts from an empty cache", () => {
    const marker = path.join(cache, "notes", "stale")
    fs.writeFileSync(marker, "")
    build("third", "--fresh")
    expect(fs.existsSync(marker)).toBe(false)
    expect(files(cache).length).toBeGreaterThan(0)
  }, 240_000)
})

describe("a DATME_CACHE datme does not own", () => {
  test("is never pruned nor emptied by --fresh", () => {
    const foreign = path.join(tmp, "foreign")
    fs.mkdirSync(foreign)
    fs.writeFileSync(path.join(foreign, "keep.md"), "mine")
    const past = new Date(Date.now() - 60_000)
    fs.utimesSync(path.join(foreign, "keep.md"), past, past)
    const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", path.join(tmp, "foreign-out"), "--fresh"], {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: foreign },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(proc.exitCode).not.toBe(0)
    expect(proc.stderr.toString()).toContain("was not created by datme")
    expect(fs.readFileSync(path.join(foreign, "keep.md"), "utf8")).toBe("mine")
  }, 240_000)
})

describe("claimCache", () => {
  test("takes an empty directory or one an older datme filled, and refuses any other", () => {
    const older = path.join(tmp, "older")
    fs.mkdirSync(path.join(older, "notes"), { recursive: true })
    fs.writeFileSync(path.join(older, "dead-links.json"), "{}")
    claimCache(older)
    expect(fs.existsSync(path.join(older, ".datme-cache"))).toBe(true)
    const fresh = path.join(tmp, "fresh-cache")
    claimCache(fresh)
    expect(fs.readdirSync(fresh)).toEqual([".datme-cache"])
    const other = path.join(tmp, "other")
    fs.mkdirSync(other)
    fs.writeFileSync(path.join(other, "notes.txt"), "mine")
    const audio = path.join(tmp, "audio-cache")
    fs.mkdirSync(path.join(audio, "tts"), { recursive: true })
    claimCache(audio)
    expect(fs.existsSync(path.join(audio, ".datme-cache"))).toBe(true)
    expect(() => claimCache(other)).toThrow("was not created by datme")
  })
})

describe("emptyCache", () => {
  test("--fresh keeps the fetched lists of dead links and neighbour notes, and the marker", () => {
    const dir = path.join(tmp, "empty")
    fs.mkdirSync(path.join(dir, "notes/ab"), { recursive: true })
    fs.writeFileSync(path.join(dir, "notes/ab/entry"), "")
    for (const f of [".datme-cache", DEAD_LINKS_FILE, NEIGHBOURS_FILE]) fs.writeFileSync(path.join(dir, f), "{}")
    emptyCache(dir)
    expect(fs.readdirSync(dir).sort()).toEqual([".datme-cache", DEAD_LINKS_FILE, NEIGHBOURS_FILE].sort())
  })
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

describe("the default cache", () => {
  test("sits in the user's cache directory of each system", () => {
    expect(userCacheDir({}, "linux", "/home/ana")).toBe("/home/ana/.cache")
    expect(userCacheDir({ XDG_CACHE_HOME: "/var/cache/ana" }, "linux", "/home/ana")).toBe("/var/cache/ana")
    expect(userCacheDir({}, "darwin", "/home/ana")).toBe("/home/ana/Library/Caches")
    expect(userCacheDir({ LOCALAPPDATA: "C:\\Users\\ana\\AppData\\Local" }, "win32", "C:\\Users\\ana")).toBe("C:\\Users\\ana\\AppData\\Local")
    expect(userCacheDir({}, "win32", "/home/ana")).toBe(path.join("/home/ana", "AppData", "Local"))
  })

  test("is one per vault, named after it, so two vaults never prune each other's entries", () => {
    const env = { XDG_CACHE_HOME: "/c" }
    const garden = defaultCacheOf("/notes/My Garden", env)
    expect(path.dirname(garden)).toBe(path.join(userCacheDir(env), "datme"))
    expect(path.basename(garden)).toMatch(/^My-Garden-[0-9a-f]{12}$/)
    expect(defaultCacheOf("/notes/My Garden", env)).toBe(garden)
    expect(defaultCacheOf("/other/My Garden", env)).not.toBe(garden)
    expect(path.basename(defaultCacheOf("/", env))).toMatch(/^vault-[0-9a-f]{12}$/)
  })
})

describe("staging folders", () => {
  test("those of builds that died are swept; a running build's and other files stay", () => {
    const dir = path.join(tmp, "staging")
    // Process 1 always runs, though as another user it may refuse our signal.
    for (const name of ["dist-999999999", `dist-${process.pid}`, "dist-1", "dist-x", "cache"]) fs.mkdirSync(path.join(dir, name), { recursive: true })
    sweepStaging(dir)
    expect(fs.readdirSync(dir).sort()).toEqual(["cache", "dist-1", `dist-${process.pid}`, "dist-x"].sort())
    // A missing folder is nothing to sweep.
    expect(() => sweepStaging(path.join(tmp, "nowhere"))).not.toThrow()
  })
})
