import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { site } from "../src/site.config"

/**
 * The cache directory is read when the module loads, so this file loads its
 * own copy of the module (a query string makes it a module of its own) with
 * DATME_CACHE pointing at a temporary directory. The copy every other module
 * imports is left alone, so no other test caches into it and mocks of it hold.
 */
const TMP = os.tmpdir()
const MODULE = path.resolve(import.meta.dir, "../src/lib/render-cache.ts")
type CacheModule = typeof import("../src/lib/render-cache")

let dir = ""
let cacheDir = ""
let cache: CacheModule
beforeAll(async () => {
  fs.mkdirSync(TMP, { recursive: true })
  dir = fs.mkdtempSync(path.join(TMP, "render-cache-"))
  cacheDir = path.join(dir, "cache")
  const before = process.env.DATME_CACHE
  process.env.DATME_CACHE = cacheDir
  try {
    cache = (await import(`${MODULE}?cache-on`)) as CacheModule
  } finally {
    if (before === undefined) delete process.env.DATME_CACHE
    else process.env.DATME_CACHE = before
  }
})
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const source = pathToFileURL(MODULE).href

describe("render cache", () => {
  test("a value written is read back, and keyed by its kind, parts and source", () => {
    expect(cache.readCache("note", source, ["a"])).toBeUndefined()
    cache.writeCache("note", source, ["a"], "value")
    cache.writeCache("note", source, ["b"], new Uint8Array([1, 2, 3]))
    expect(cache.readCache("note", source, ["a"])?.toString("utf8")).toBe("value")
    expect([...cache.readCache("note", source, ["b"])!]).toEqual([1, 2, 3])
    expect(cache.readCache("card", source, ["a"])).toBeUndefined()
    expect(cache.readCache("note", source, ["c"])).toBeUndefined()
    // A source that is not a file is keyed by the version and the config alone.
    cache.writeCache("note", "virtual:module", ["a"], "other")
    expect(cache.readCache("note", "virtual:module", ["a"])?.toString()).toBe("other")
    expect(cache.readCache("note", source, ["a"])?.toString()).toBe("value")
  })

  test("entries are written whole, and a read marks them as used by this build", () => {
    const files = fs.readdirSync(path.join(cacheDir, "note"), { recursive: true, withFileTypes: true }).filter((f) => f.isFile())
    expect(files.length).toBe(3)
    expect(files.every((f) => !f.name.endsWith(".tmp"))).toBe(true)
    const old = new Date("2001-01-01")
    for (const f of files) fs.utimesSync(path.join(f.parentPath, f.name), old, old)
    cache.readCache("note", source, ["a"])
    const years = files.map((f) => fs.statSync(path.join(f.parentPath, f.name)).mtime.getFullYear()).sort()
    expect(years).toEqual([2001, 2001, new Date().getFullYear()])
  })

  test("a config edit that cannot change a note keeps the entries; one that can does not", () => {
    // Salts are worked out once per source and process, so each config gets a source of its own.
    cache.writeCache("salted", "virtual:as-is", ["a"], "kept")
    const { nav, footer, theme } = site
    try {
      site.nav = [{ kind: "url", target: "https://example.com", label: { "en-US": "Elsewhere" } }]
      site.footer = []
      expect(cache.readCache("salted", "virtual:menus", ["a"])?.toString()).toBe("kept")
      site.theme = { ...theme, code: { light: "nord", dark: "nord" } }
      expect(cache.readCache("salted", "virtual:code-theme", ["a"])).toBeUndefined()
    } finally {
      Object.assign(site, { nav, footer, theme })
    }
  })

  test("a cache that cannot be written only goes without", () => {
    // A file where the kind's directory should be: no entry can be made below it.
    fs.writeFileSync(path.join(cacheDir, "blocked"), "not a directory")
    expect(() => cache.writeCache("blocked", source, ["a"], "value")).not.toThrow()
    expect(cache.readCache("blocked", source, ["a"])).toBeUndefined()
  })
})

describe("stable cache", () => {
  test("is keyed by kind and parts alone, so a config edit keeps its entries", () => {
    expect(cache.stableCacheFile("tts", ["a"])).toBeUndefined()
    const written = cache.writeStableCache("tts", ["a"], Buffer.from("audio"))!
    expect(fs.readFileSync(written, "utf8")).toBe("audio")
    const title = site.title
    const unstable = () => cache.readCache("tts-salted", source, ["a"])
    cache.writeCache("tts-salted", source, ["a"], "salted")
    expect(unstable()?.toString()).toBe("salted")
    site.title = { ...title, en: "edited" }
    try {
      expect(cache.stableCacheFile("tts", ["a"])).toBe(written)
      expect(cache.stableCacheFile("tts", ["b"])).toBeUndefined()
      expect(cache.stableCacheFile("other", ["a"])).toBeUndefined()
    } finally {
      site.title = title
    }
  })

  test("a read marks the entry as used, and a cache that cannot be written only goes without", () => {
    cache.writeStableCache("touch", ["a"], Buffer.from("x"))
    const file = fs.readdirSync(path.join(cacheDir, "touch"), { recursive: true, withFileTypes: true }).find((f) => f.isFile())!
    const old = new Date("2001-01-01")
    fs.utimesSync(path.join(file.parentPath, file.name), old, old)
    cache.stableCacheFile("touch", ["a"])
    expect(fs.statSync(path.join(file.parentPath, file.name)).mtime.getFullYear()).toBe(new Date().getFullYear())
    fs.writeFileSync(path.join(cacheDir, "blocked-stable"), "not a directory")
    expect(cache.writeStableCache("blocked-stable", ["a"], Buffer.from("x"))).toBeUndefined()
    expect(cache.stableCacheFile("blocked-stable", ["a"])).toBeUndefined()
  })

  test("is off when DATME_CACHE is empty", () => {
    // A subprocess, so a second copy of the module does not show up in the coverage report.
    const script = `const c = await import(${JSON.stringify(MODULE)}); console.log(String(c.writeStableCache("tts", ["a"], Buffer.from("audio"))), String(c.stableCacheFile("tts", ["a"])))`
    const proc = Bun.spawnSync(["bun", "-e", script], { cwd: dir, env: { ...process.env, DATME_CACHE: "" }, stdout: "pipe", stderr: "pipe" })
    expect(proc.stderr.toString()).toBe("")
    expect(proc.stdout.toString().trim()).toBe("undefined undefined")
    expect(fs.readdirSync(dir)).toEqual(["cache"])
  })
})

describe("cache stats", () => {
  test("shared through globalThis and formatted with a rate", () => {
    const g = globalThis as { __datmeCacheStats?: unknown }
    const before = g.__datmeCacheStats
    delete g.__datmeCacheStats
    try {
      const stats = cache.cacheStats()
      expect(stats).toEqual({ reused: 0, reusedWithDeps: 0, rendered: 0, uncached: 0 })
      stats.reused = 2
      expect(cache.cacheStats()).toBe(stats)
      expect(g.__datmeCacheStats).toBe(stats)
    } finally {
      g.__datmeCacheStats = before
    }
    expect(cache.formatCacheStats({ reused: 0, reusedWithDeps: 0, rendered: 0, uncached: 0 })).toBe(
      "Notes: 0 reused (0 with embeds or queries), 0 rendered, 0 never cached; 0% from the cache",
    )
    expect(cache.formatCacheStats({ reused: 1, reusedWithDeps: 1, rendered: 1, uncached: 0 })).toBe(
      "Notes: 2 reused (1 with embeds or queries), 1 rendered, 0 never cached; 67% from the cache",
    )
  })
})
