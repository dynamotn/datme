import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// A vault with no datme.yaml and no home note must still produce a working site.
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/minimal")
let out = ""
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")
const exists = (p: string) => fs.existsSync(path.join(out, p))

beforeAll(() => {
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-zero-")), "site")
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
}, 180_000)

afterAll(() => {
  fs.rmSync(path.dirname(out), { recursive: true, force: true })
})

describe("zero-config build", () => {
  test("the site is English, single-language and named after the vault folder", () => {
    const home = read("index.html")
    expect(home).toContain('<html lang="en-US"')
    expect(home).toContain("<title>minimal</title>")
    expect(home).not.toContain('class="lang-switch"')
    expect(exists("en-US")).toBe(false)
  })

  test("published notes get pages at Quartz-style URLs, unmarked notes do not", () => {
    expect(read("Hello/index.html")).toContain("My first public note")
    expect(read("Projects/Nested-note/index.html")).toContain('href="/Hello"')
    expect(exists("Secret")).toBe(false)
  })

  test("notes tagged blog appear as cards on the home page", () => {
    expect(read("index.html")).toMatch(/class="index-card featured"[\s\S]*?href="\/Hello"/)
  })

  test("without site.url there is no sitemap and robots.txt does not point to one", () => {
    expect(exists("sitemap-index.xml")).toBe(false)
    expect(read("robots.txt")).not.toContain("Sitemap")
    expect(read("index.xml")).toContain("<item>")
  })

  test("the default look is notebook with a home and tags menu", () => {
    const home = read("index.html")
    expect(home).toContain('data-look="notebook"')
    const nav = home.match(/<nav class="main-nav"[\s\S]*?<\/nav>/)![0]
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/", "/tags"])
  })

  test("without stages the home lists top-level folders", () => {
    expect(read("index.html")).toMatch(/class="nb-hero-side"[\s\S]*Projects/)
  })

  test("the logo comes from the vault name", () => {
    expect(read("favicon.svg")).toContain(">M</text>")
  })
})
