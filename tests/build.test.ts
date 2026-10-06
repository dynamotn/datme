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

  test("unpublished, draft and ignored notes are never emitted", () => {
    const all = fs.readdirSync(out, { recursive: true }).join("\n")
    expect(all).not.toMatch(/Private|Idea|Template/)
    const search = read("static/contentIndex.vi-VN.json")
    expect(search).not.toContain("Never published")
    expect(search).not.toContain("Protected content")
  })

  test("protected notes ship only ciphertext that the password opens", async () => {
    const html = read("06_Reference/Secret/index.html")
    const payload = html.match(/data-payload="([^"]+)"/)![1]
    const { decrypt } = await import("../src/scripts/decrypt")
    expect(await decrypt(payload, "fixture-not-a-real-secret", 100_000)).toContain("Protected content")
    for (const file of fs.readdirSync(out, { recursive: true }) as string[]) {
      const p = path.join(out, file)
      if (fs.statSync(p).isFile()) {
        const body = fs.readFileSync(p, "utf8")
        expect(body.includes("Protected content")).toBe(false)
        expect(body.includes("fixture-not-a-real-secret")).toBe(false)
      }
    }
  })

  test("aliases redirect to their note", () => {
    const html = read("03_Atomic/Slip-box/index.html")
    expect(html).toContain('http-equiv="refresh"')
    expect(html).toContain("/03_Atomic/Zettelkasten")
  })

  test("the properties block shows nested frontmatter and links, not bookkeeping", () => {
    const html = read("06_Reference/Niklas-Luhmann/index.html")
    const props = html.match(/<details class="properties">[\s\S]*?<\/details>/)![0]
    expect(props).toContain("<dt>fullname</dt>")
    expect(props).toContain('<a href="/03_Atomic/Zettelkasten" class="internal">the slip box</a>')
    expect(props).not.toMatch(/uid|template|20240101000000/)
  })

  test("the note page shows its backlinks and language alternates", () => {
    const html = read("06_Reference/Niklas-Luhmann/index.html")
    expect(html).toContain('class="backlink internal" href="/03_Atomic/Zettelkasten"')
    expect(html).toContain('hreflang="en-US" href="https://notes.dynamotn.dev/en-US/06_Reference/Niklas-Luhmann-(sociologist)"')
  })

  test("referenced assets are copied, nothing else", () => {
    expect(exists("assets/_assets/images/diagram.png")).toBe(true)
    expect(fs.readdirSync(path.join(out, "assets/_assets")).sort()).toEqual(["draw", "images"])
    expect(exists("assets/_assets/draw/Flow.excalidraw.md")).toBe(false)
  })

  test("search filters by folder and type, the graph by folder and tag", () => {
    const home = read("index.html")
    const search = home.match(/<div class="filters" data-filters="search">[\s\S]*?<\/div>/)![0]
    expect(search).toContain('data-filter="folder"')
    expect(search).toContain('<option value="03_Atomic">⚛️ Nguyên tử (2)</option>')
    expect(search).toContain('<option value="notion">notion (1)</option>')
    const graph = home.match(/<div class="filters" data-filters="graph">[\s\S]*?<\/div>/)![0]
    expect(graph).toContain('data-filter="tag"')
    expect(graph).toContain('<option value="theme/pkm">#theme/pkm (1)</option>')
    expect(graph).not.toContain("type/")
  })

  test("the content index links notes for search and the graph", () => {
    const index = JSON.parse(read("static/contentIndex.en-US.json"))
    expect(index.notes.map((n: { t: string }) => n.t)).toContain("Zettelkasten method")
    expect(index.notes.find((n: { t: string }) => n.t === "Zettelkasten method")).toMatchObject({ p: "03_Atomic", y: ["notion"] })
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

  test("the notebook home shows the newest blog post as a featured card and notes as index cards", () => {
    const home = read("index.html")
    expect(home).toMatch(/class="index-card featured" data-ribbon="Nổi bật"/)
    expect(home).toContain('class="nb-hero-side"')
    expect((home.match(/class="index-card"/g) ?? []).length).toBeGreaterThan(1)
  })

  test("folder and tag pages list notes as index cards", () => {
    expect(read("06_Reference/index.html")).toContain('class="card-wall"')
    expect(read("tags/theme/pkm/index.html")).toContain('class="index-card"')
  })

  test("analytics load on every page and report client-side navigations", () => {
    const home = read("index.html")
    expect(home).toContain("https://www.googletagmanager.com/gtag/js?id=G-TEST123")
    expect(home).toContain('"page_view"')
  })

  test("note pages carry the comment widget, other pages do not", () => {
    const note = read("03_Atomic/Zettelkasten/index.html")
    expect(note).toContain('src="https://giscus.app/client.js"')
    expect(note).toContain('data-repo="example/garden"')
    expect(note).toContain('data-lang="vi"')
    expect(read("tags/index.html")).not.toContain("giscus")
  })

  test("notes without a banner get a generated 1200x630 social card", () => {
    const html = read("03_Atomic/Zettelkasten/index.html")
    expect(html).toContain('<meta property="og:image" content="https://notes.dynamotn.dev/og/03_Atomic/Zettelkasten.png"')
    const png = fs.readFileSync(path.join(out, "og/03_Atomic/Zettelkasten.png"))
    expect(png.subarray(1, 4).toString()).toBe("PNG")
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })

  test("notes with a banner keep it, other pages share the home card", () => {
    expect(read("07_Project/Blog-post/index.html")).toContain('content="https://notes.dynamotn.dev/assets/_assets/images/diagram.png"')
    expect(exists("og/07_Project/Blog-post.png")).toBe(false)
    expect(read("tags/index.html")).toContain('content="https://notes.dynamotn.dev/og/index.png"')
    expect(exists("og/en-US/index.png")).toBe(true)
  })

  test("CNAME holds the host of site.url", () => {
    expect(read("CNAME")).toBe("notes.dynamotn.dev\n")
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
