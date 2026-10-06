import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// End-to-end: build the fixture vault through the CLI and inspect the output.
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/vault")
let out = ""
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")
const exists = (p: string) => fs.existsSync(path.join(out, p))

beforeAll(() => {
  // A directory on another filesystem than the package, as `--out` usually is.
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-build-")), "site")
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

describe("static build", () => {
  test("home pages exist in both languages", () => {
    expect(read("index.html")).toContain("Xin chào")
    expect(read("en-US/index.html")).toContain("Welcome")
  })

  test("notes, folders and tags get pages", () => {
    for (const p of [
      "03_Atomic/Zettelkasten/index.html",
      "en-US/03_Atomic/Zettelkasten-method/index.html",
      "06_Reference/index.html",
      "01_Fleeting/index.html",
      "tags/index.html",
      "tags/type/blog/index.html",
      "en-US/tags/theme/pkm/index.html",
    ]) {
      expect(exists(p)).toBe(true)
    }
  })

  test("unpublished, draft, protected and ignored notes are never emitted", () => {
    const all = fs.readdirSync(out, { recursive: true }).join("\n")
    expect(all).not.toMatch(/Private|Secret|Idea|Template/)
    const search = read("static/contentIndex.vi-VN.json")
    expect(search).not.toContain("Never published")
    expect(search).not.toContain("Protected content")
  })

  test("aliases redirect to their note", () => {
    const html = read("03_Atomic/Slip-box/index.html")
    expect(html).toContain('http-equiv="refresh"')
    expect(html).toContain("/03_Atomic/Zettelkasten")
  })

  test("the note page shows its backlinks and language alternates", () => {
    const html = read("06_Reference/Niklas-Luhmann/index.html")
    expect(html).toContain('class="backlink internal" href="/03_Atomic/Zettelkasten"')
    expect(html).toContain('hreflang="en-US" href="https://notes.dynamotn.dev/en-US/06_Reference/Niklas-Luhmann-(sociologist)"')
  })

  test("referenced assets are copied, nothing else", () => {
    expect(exists("assets/_assets/images/diagram.png")).toBe(true)
    expect(fs.readdirSync(path.join(out, "assets/_assets"))).toEqual(["images"])
  })

  test("the content index links notes for search and the graph", () => {
    const index = JSON.parse(read("static/contentIndex.en-US.json"))
    expect(index.notes.map((n: { t: string }) => n.t)).toContain("Zettelkasten method")
    expect(index.links.length).toBeGreaterThan(0)
  })

  test("notes use the notebook look, except folders listed as classic", () => {
    expect(read("03_Atomic/Zettelkasten/index.html")).toContain('data-look="notebook"')
    expect(read("07_Project/Blog-post/index.html")).toContain('data-look="classic"')
  })

  test("the main menu lists the configured pages and skips missing notes", () => {
    const nav = read("index.html").match(/<nav class="main-nav"[\s\S]*?<\/nav>/)![0]
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/", "/06_Reference/Niklas-Luhmann", "/tags"])
    expect(nav).toContain("Về Luhmann")
  })

  test("favicon and robots.txt come from the config", () => {
    expect(read("favicon.svg")).toContain(">K</text>")
    expect(read("robots.txt")).toContain("Sitemap: https://notes.dynamotn.dev/sitemap-index.xml")
  })

  test("RSS feeds and the sitemap are generated", () => {
    expect(read("index.xml")).toContain("<item>")
    expect(read("en-US/index.xml")).toContain("<language>en-US</language>")
    expect(exists("sitemap-index.xml")).toBe(true)
  })
})
