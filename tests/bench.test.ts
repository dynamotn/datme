import { afterEach, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  type BenchResult,
  compare,
  dirSize,
  fileOf,
  formatComparison,
  formatResult,
  formatValue,
  pageAssets,
  pageWeight,
  parseBenchArgs,
  parseMargins,
  pickBaseline,
  staticImports,
} from "../tools/bench-report"
import { cli, generateVault, intFlag, png, random, writeVault } from "../tools/bench-vault"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-bench-test-"))
  dirs.push(dir)
  return dir
}
const text = (v: string | Uint8Array | undefined) => (typeof v === "string" ? v : "")

describe("generateVault", () => {
  test("gives the same bytes for the same seed and size, and others for another seed", () => {
    const a = generateVault({ notes: 300, seed: 7 })
    const b = generateVault({ notes: 300, seed: 7 })
    expect([...a.files.keys()]).toEqual([...b.files.keys()])
    for (const [rel, content] of a.files) expect(b.files.get(rel)).toEqual(content)
    expect(text(generateVault({ notes: 300, seed: 8 }).files.get(a.probe))).not.toBe(text(a.files.get(a.probe)))
  })

  test("has the notes asked for, in nested folders, with a home page, a config and pictures", () => {
    const { files, probe, locked } = generateVault({ notes: 1200 })
    const notes = [...files.keys()].filter((f) => /^Area-\d+\/Topic-\d+\/Note-\d+\.md$/.test(f))
    expect(notes).toHaveLength(1200)
    expect(new Set(notes.map((f) => path.dirname(f))).size).toBe(12)
    expect(new Set(notes.map((f) => f.split("/")[0])).size).toBe(3)
    expect(text(files.get("datme.yaml"))).toContain("languages: [en-US, vi-VN]")
    expect(text(files.get("index.md"))).toContain("[[Note-00500]]")
    expect(probe).toBe("Area-01/Topic-006/Note-00600.md")
    expect(text(files.get(locked))).toContain("password: ")
    const pictures = [...files.entries()].filter(([f]) => f.endsWith(".png"))
    expect(pictures).toHaveLength(12)
    expect(pictures[0]![1]).toBeInstanceOf(Uint8Array)
  })

  test("writes what the benchmark needs datme to render", () => {
    const { files, probe } = generateVault({ notes: 1000 })
    const all = [...files.values()].map(text).join("\n")
    const count = (re: RegExp) => all.match(re)?.length ?? 0
    expect(count(/\[\[Note-\d+(\|[^\]]+)?\]\]/g)).toBeGreaterThan(3000)
    expect(count(/!\[\[Note-\d+#Notes\]\]/g)).toBeGreaterThan(10)
    expect(count(/!\[\[picture-\d+\.png\]\]/g)).toBeGreaterThan(30)
    expect(count(/```dataview/g)).toBeGreaterThanOrEqual(6)
    expect(count(/^lang: vi-VN$/gm)).toBe(50)
    expect(count(/<!--lang:vi-VN-->/g)).toBe(100)
    expect(count(/^tags: \[.*\/.*\]$/gm)).toBeGreaterThan(100)
    expect(count(/^password: /gm)).toBe(1)
    // The note the benchmark edits is a plain one, in the site's first language.
    expect(text(files.get(probe))).not.toContain("lang:")
    // Links never point at a note that does not exist, nor at the note itself.
    const names = new Set([...files.keys()].map((f) => path.basename(f, ".md")))
    for (const [rel, content] of files) {
      for (const [, name] of text(content).matchAll(/\[\[(Note-\d+)/g)) {
        expect(names.has(name!)).toBe(true)
        expect(name).not.toBe(path.basename(rel, ".md"))
      }
    }
  })

  test("refuses a vault too small to have hubs and folders", () => {
    expect(() => generateVault({ notes: 5 })).toThrow("at least 10 notes")
    expect(() => generateVault({ notes: 10.5 })).toThrow("at least 10 notes")
    expect(generateVault({ notes: 10 }).files.size).toBe(10 + 2 + 12)
  })

  test("is 10,000 notes by default", () => {
    expect(generateVault().probe).toBe("Area-10/Topic-050/Note-05000.md")
  })
})

test("random is seeded and stays in [0, 1)", () => {
  const [a, b] = [random(42), random(42)]
  const values = Array.from({ length: 1000 }, () => a())
  expect(values).toEqual(Array.from({ length: 1000 }, () => b()))
  expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
  expect(random(43)()).not.toBe(values[0])
})

test("png writes a picture of the size asked for, the same each time", () => {
  const bytes = png(32, 16, 5)
  const buf = Buffer.from(bytes)
  expect(buf.subarray(1, 4).toString()).toBe("PNG")
  expect(buf.readUInt32BE(16)).toBe(32)
  expect(buf.readUInt32BE(20)).toBe(16)
  expect(buf.subarray(-8, -4).toString()).toBe("IEND")
  expect(png(32, 16, 5)).toEqual(bytes)
})

test("writeVault puts every file in its folder", () => {
  const dir = tmp()
  const vault = generateVault({ notes: 120 })
  writeVault(dir, vault)
  expect(fs.readFileSync(path.join(dir, vault.probe), "utf8")).toBe(text(vault.files.get(vault.probe)))
  expect(fs.readFileSync(path.join(dir, "_assets/picture-00.png"))).toEqual(Buffer.from(vault.files.get("_assets/picture-00.png") as Uint8Array))
})

test("intFlag reads whole numbers and names the flag otherwise", () => {
  expect(intFlag("notes", undefined, 7)).toBe(7)
  expect(intFlag("notes", "12", 7, 10)).toBe(12)
  expect(() => intFlag("notes", "9", 7, 10)).toThrow('--notes takes a whole number of at least 10, not "9"')
  expect(() => intFlag("seed", "x", 7)).toThrow("--seed")
})

describe("bench-vault cli", () => {
  test("writes the vault where asked and prints the directory", () => {
    const dir = path.join(tmp(), "vault")
    const log = spyOn(console, "log").mockImplementation(() => {})
    try {
      expect(cli(["--notes", "20", "--seed", "3", "--out", dir])).toBe(0)
      expect(log).toHaveBeenCalledWith(dir)
      expect(fs.existsSync(path.join(dir, "Area-00/Topic-000/Note-00019.md"))).toBe(true)
    } finally {
      log.mockRestore()
    }
  })

  test("writes to a new temporary directory by default", () => {
    const log = spyOn(console, "log").mockImplementation(() => {})
    try {
      expect(cli(["--notes", "10"])).toBe(0)
      const dir = log.mock.calls[0]![0] as string
      dirs.push(dir)
      expect(dir.startsWith(os.tmpdir())).toBe(true)
      expect(fs.existsSync(path.join(dir, "datme.yaml"))).toBe(true)
    } finally {
      log.mockRestore()
    }
  })

  test("fails on a bad flag or a directory that is not empty", () => {
    const err = spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(cli(["--notes", "3"])).toBe(1)
      expect(err).toHaveBeenLastCalledWith('--notes takes a whole number of at least 10, not "3"')
      const dir = tmp()
      fs.writeFileSync(path.join(dir, "note.md"), "")
      expect(cli(["--out", dir])).toBe(1)
      expect(err).toHaveBeenLastCalledWith(`${dir} is not empty`)
    } finally {
      err.mockRestore()
    }
  })
})

const result = (metrics: BenchResult["metrics"], extra: Partial<BenchResult> = {}): BenchResult => ({
  version: 1,
  datme: "3.2.0",
  date: "2026-10-24T00:00:00.000Z",
  machine: { platform: "linux", arch: "x64", cpu: "Test CPU", cpus: 4, memory: 8 * 1024 ** 3, runtime: "Bun 1.4.2" },
  notes: 1000,
  seed: 1,
  metrics,
  ...extra,
})

test("formatValue writes times, sizes and counts", () => {
  expect(formatValue(undefined, "ms")).toBe("-")
  expect(formatValue(456.4, "ms")).toBe("456 ms")
  expect(formatValue(2345, "ms")).toBe("2.35 s")
  expect(formatValue(83_210, "ms")).toBe("83.2 s")
  expect(formatValue(12, "count")).toBe("12")
  expect(formatValue(900, "bytes")).toBe("900 B")
  expect(formatValue(2048, "bytes")).toBe("2.0 KiB")
  expect(formatValue(5 * 1024 ** 2, "bytes")).toBe("5.0 MiB")
  expect(formatValue(3 * 1024 ** 3, "bytes")).toBe("3.00 GiB")
})

test("formatResult lists the metrics measured, the machine, and the problems", () => {
  const out = formatResult(result({ buildColdMs: 61_000, outputFiles: 9000 }, { problems: ["dev never served the change"] }))
  expect(out).toContain("datme 3.2.0, 1000 notes (seed 1), on Test CPU (4 threads, 8.00 GiB), linux/x64, Bun 1.4.2")
  expect(out).toMatch(/Cold build \(empty cache\) +61\.0 s/)
  expect(out).toMatch(/Output files +9000/)
  expect(out).not.toContain("Warm build")
  expect(out).toContain("Problem: dev never served the change")
  expect(formatResult(result({}))).not.toContain("Problem")
})

test("pickBaseline takes the run of the same size and seed, from one result or a list", () => {
  const small = result({ buildColdMs: 1 })
  const large = result({ buildColdMs: 2 }, { notes: 10000 })
  expect(pickBaseline(small, 1000, 1)).toBe(small)
  expect(pickBaseline([small, large], 10000, 1)).toBe(large)
  expect(pickBaseline([small, large], 500, 1)).toBeUndefined()
  expect(pickBaseline(small, 1000, 2)).toBeUndefined()
  expect(pickBaseline([null, { notes: 1000, seed: 1 }], 1000, 1)).toBeUndefined()
})

describe("compare", () => {
  const base = result({ buildColdMs: 1000, buildWarmMs: 100, outputBytes: 0, devRebuildMs: 50, tarballBytes: 10 })
  const now = result({ buildColdMs: 1100, buildWarmMs: 130, outputBytes: 10, devRebuildMs: 80, installBytes: 5 })

  test("flags a metric that grew by more than its margin", () => {
    const rows = compare(base, now)
    const row = (m: string) => rows.find((r) => r.metric === m)!
    expect(row("buildColdMs")).toMatchObject({ change: expect.closeTo(0.1), worse: false, margin: 0.15 })
    expect(row("buildWarmMs")).toMatchObject({ worse: true })
    // No change can be measured from zero, nor from or to a metric one side lacks.
    expect(row("outputBytes")).toMatchObject({ change: undefined, worse: false })
    expect(row("tarballBytes")).toMatchObject({ current: undefined, worse: false })
    expect(row("installBytes")).toMatchObject({ base: undefined, worse: false })
    expect(rows.find((r) => r.metric === "graphBytes")).toBeUndefined()
  })

  test("takes a margin for all metrics, and one per metric", () => {
    const rows = compare(base, now, 0.05, { buildWarmMs: 0.5, devRebuildMs: 1 })
    expect(rows.filter((r) => r.worse).map((r) => r.metric)).toEqual(["buildColdMs"])
  })

  test("prints a table and names what got worse", () => {
    const out = formatComparison(compare(base, now))
    expect(out).toMatch(/Cold build \(empty cache\) +1\.00 s +1\.10 s +\+10\.0%/)
    expect(out).toMatch(/Warm build \(cache filled\) +100 ms +130 ms +\+30\.0% +worse \(> 15%\)/)
    expect(out).toContain("2 metric(s) worse than their margin: buildWarmMs, devRebuildMs")
    const better = formatComparison(compare(now, base))
    expect(better).toContain("-9.1%")
    expect(better).toContain("No metric got worse than its margin.")
  })
})

test("parseMargins reads name=percent pairs, comma-separated or repeated", () => {
  expect(parseMargins(["devRebuildMs=30,buildColdMs=25", "graphBytes=0", ""])).toEqual({ devRebuildMs: 0.3, buildColdMs: 0.25, graphBytes: 0 })
  expect(() => parseMargins(["nope=3"])).toThrow('no metric named "nope"')
  expect(() => parseMargins(["buildColdMs"])).toThrow('buildColdMs takes a percentage, not "undefined"')
  expect(() => parseMargins(["buildColdMs="])).toThrow("takes a percentage")
  expect(() => parseMargins(["buildColdMs=-1"])).toThrow("takes a percentage")
})

test("parseBenchArgs has defaults, reads every flag, and stops for --help", () => {
  expect(parseBenchArgs([])).toEqual({
    notes: 10000,
    seed: 1,
    json: undefined,
    compare: undefined,
    margin: 0.15,
    margins: {},
    dev: true,
    install: false,
    keep: false,
    timeout: 30 * 60_000,
    devTimeout: 60_000,
  })
  expect(
    parseBenchArgs([
      ...["--notes", "1000", "--seed", "2", "--json", "out.json", "--compare", "base.json", "--margin", "20"],
      ...["--margin-for", "devRebuildMs=40", "--no-dev", "--install", "--keep", "--timeout", "5", "--dev-timeout", "9"],
    ]),
  ).toEqual({
    notes: 1000,
    seed: 2,
    json: "out.json",
    compare: "base.json",
    margin: 0.2,
    margins: { devRebuildMs: 0.4 },
    dev: false,
    install: true,
    keep: true,
    timeout: 5 * 60_000,
    devTimeout: 9000,
  })
  expect(parseBenchArgs(["-h"])).toBeUndefined()
  expect(() => parseBenchArgs(["--notes", "2"])).toThrow("--notes")
})

test("pageAssets lists the site's own scripts and stylesheets a page loads", () => {
  const html = `<head>
    <link rel="stylesheet" href="/_astro/a.css"><link rel=stylesheet href=/_astro/b.css>
    <link rel="stylesheet" href="https://fonts.example/f.css"><link rel="icon" href="/favicon.svg">
    <link rel="modulepreload" href="/_astro/pre.js"><link rel="preload" href="/x.woff2">
    <script type="module" src="/_astro/page.js"></script><script src="//cdn.example/x.js"></script>
    <script>inline()</script><script src="data:text/javascript,1"></script><link href="/c.css">
    <script type="module" src="/_astro/page.js"></script>`
  expect(pageAssets(html)).toEqual({ scripts: ["/_astro/page.js", "/_astro/pre.js"], styles: ["/_astro/a.css", "/_astro/b.css"] })
})

test("staticImports finds static imports and re-exports, not dynamic ones", () => {
  const js = `import{a as b}from"./chunk.A.js";import "./side.js";import*as c from'../c.js';export{d}from"./d.js";export * from "./e.js";const x=import("./lazy.js");`
  expect(staticImports(js)).toEqual(["./chunk.A.js", "./side.js", "../c.js", "./d.js", "./e.js"])
})

test("fileOf maps a URL to the built site, never above it", () => {
  expect(fileOf("/site", "/_astro/a.js")).toBe(path.join("/site", "_astro/a.js"))
  expect(fileOf("/site", "./b.js", "/_astro/a.js")).toBe(path.join("/site", "_astro/b.js"))
  expect(fileOf("/site", "/Note%20one/")).toBe(path.join("/site", "Note one/"))
  expect(fileOf("/site", "../../etc/passwd", "/a/")).toBe(path.join("/site", "etc/passwd"))
})

test("pageWeight adds up the page, its stylesheets and its scripts with their static imports", () => {
  const site = tmp()
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(site, rel)), { recursive: true })
    fs.writeFileSync(path.join(site, rel), content)
  }
  const html = `<link rel="stylesheet" href="/_astro/a.css"><link rel="stylesheet" href="/_astro/gone.css"><script type="module" src="/_astro/page.js"></script><script type="module" src="/_astro/missing.js"></script>`
  write("Note/index.html", html)
  write("_astro/a.css", "x".repeat(100))
  write("_astro/page.js", `import"./chunk.js";import"./chunk.js";import"https://cdn.example/x.js";import("./lazy.js")`)
  write("_astro/chunk.js", `import"./page.js";export const a=1`)
  write("_astro/lazy.js", "x".repeat(1000))
  const page = fs.readFileSync(path.join(site, "_astro/page.js")).length
  const chunk = fs.readFileSync(path.join(site, "_astro/chunk.js")).length
  expect(pageWeight(site, "/Note/")).toEqual({ html: html.length, css: 100, js: page + chunk })
  expect(pageWeight(site, "/Note/index.html").js).toBe(page + chunk)
})

test("dirSize counts the bytes and files under a directory", () => {
  const dir = tmp()
  fs.mkdirSync(path.join(dir, "a/b"), { recursive: true })
  fs.writeFileSync(path.join(dir, "one"), "12345")
  fs.writeFileSync(path.join(dir, "a/b/two"), "123")
  fs.symlinkSync(path.join(dir, "one"), path.join(dir, "link"))
  expect(dirSize(dir)).toEqual({ bytes: 8, files: 2 })
})
