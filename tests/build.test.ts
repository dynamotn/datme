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

  test("a linked canvas becomes a pannable page of cards and edges", () => {
    const html = read("07_Project/Map.canvas/index.html")
    expect(html).toContain('class="canvas-viewport" data-canvas')
    expect(html).toMatch(/class="cv-node cv-file internal"[^>]*href="\/06_Reference\/Niklas-Luhmann"/)
    expect(html).toContain('<img src="/assets/_assets/images/diagram.png"')
    // A file card for an unpublished note does not even show its name.
    expect(html).toMatch(/<div class="cv-node cv-missing"[^>]*>🔒 Chưa xuất bản<\/div>/)
    expect(html).not.toContain("Private.md")
    expect(html).toContain(">inspired</text>")
    expect(read("en-US/07_Project/Map.canvas/index.html")).toContain("English card")
    expect(read("07_Project/Blog-post/index.html")).toContain('href="/07_Project/Map.canvas" class="internal doc">project map</a>')
  })

  test("canvas files are never copied raw, and unlinked ones are not published", () => {
    const all = (fs.readdirSync(out, { recursive: true }) as string[]).join("\n")
    expect(all).not.toContain("Unlinked")
    const rawCanvas = (fs.readdirSync(out, { recursive: true }) as string[]).filter(
      (f) => f.endsWith(".canvas") && fs.statSync(path.join(out, f)).isFile(),
    )
    expect(rawCanvas).toEqual([])
  })

  test("a base embedded in a note renders its view, and gets a page with every view", () => {
    const home = read("index.html")
    expect(home).toContain('<div class="base-embed"><table class="dataview base-table"><thead><tr><th>Name</th><th>Full name</th><th>shout</th></tr>')
    expect(home).toContain("<td>NIKLAS LUHMANN!</td>")
    const page = read("05_Structure/Library.base/index.html")
    expect(page).toContain("<h2>People</h2>")
    expect(page).toContain('class="card-wall base-cards"')
    expect((page.match(/class="index-card base-card"/g) ?? []).length).toBe(2)
    // Views only see published, unprotected notes.
    const content = page.match(/<div class="note is-wide base-page">[\s\S]*?<footer/)![0]
    expect(content).not.toMatch(/Private|Secret/)
  })

  test("the archive lists notes by the year they were created, newest first", () => {
    const html = read("archive/index.html")
    const years = [...html.matchAll(/<h2 id="y(\d{4})">/g)].map((m) => m[1])
    expect(years).toEqual([...years].sort().reverse())
    expect(html).toContain('<a class="internal" href="/07_Project/Blog-post">')
    expect(exists("en-US/archive/index.html")).toBe(true)
    expect(html).toContain('class="activity-grid"')
    const link = html.match(/<a class="day l\d" href="#(d[\d-]+)"/)![1]
    expect(html).toContain(`<li id="${link}">`)
  })

  test("a permalinked note lives at its permalink and its old URL redirects", () => {
    expect(read("poems/rain/index.html")).toContain("Plain stanza")
    expect(read("07_Project/Poem/index.html")).toContain('content="0; url=/poems/rain"')
  })

  test("_redirects lists 301s for aliases and old URLs", () => {
    const lines = read("_redirects").trim().split("\n")
    expect(lines).toContain("/03_Atomic/Slip-box /03_Atomic/Zettelkasten 301")
    expect(lines).toContain("/07_Project/Poem /poems/rain 301")
    expect(lines).toContain("/en-US/07_Project/Poem /en-US/poems/rain 301")
    expect(lines.every((l) => /^\/\S* \/\S* 301$/.test(l))).toBe(true)
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

  test("untranslated pages say so, point canonical at the original and skip fake hreflang", () => {
    const html = read("en-US/06_Reference/Niklas-Luhmann-(sociologist)/index.html")
    expect(html).toContain('<p class="untranslated">')
    expect(html).toContain('<link rel="canonical" href="https://notes.dynamotn.dev/06_Reference/Niklas-Luhmann">')
    expect(html).not.toContain('<link rel="alternate" hreflang="en-US"')
    expect(html).toContain('<div class="prose" lang="vi-VN">')
    const translated = read("en-US/03_Atomic/Zettelkasten-method/index.html")
    expect(translated).not.toContain('class="untranslated"')
    expect(translated).toContain('<link rel="alternate" hreflang="en-US"')
    expect(read("en-US/06_Reference/index.html")).toContain('<span class="lang-badge" title="Tiếng Việt">VI</span>')
  })

  test("the note page shows its backlinks and language alternates", () => {
    const html = read("06_Reference/Niklas-Luhmann/index.html")
    expect(html).toContain('class="backlink internal" href="/03_Atomic/Zettelkasten"')
    // The English Luhmann page has no text of its own, so it is not advertised.
    expect(html).not.toContain('<link rel="alternate" hreflang="en-US"')
    expect(read("03_Atomic/Zettelkasten/index.html")).toContain(
      'hreflang="en-US" href="https://notes.dynamotn.dev/en-US/03_Atomic/Zettelkasten-method"',
    )
  })

  test("note pages suggest related notes and list unlinked mentions", () => {
    const zk = read("03_Atomic/Zettelkasten/index.html")
    expect(zk).toMatch(/<section class="backlinks related">[\s\S]*?href="\/03_Atomic\/Code"[\s\S]*?#theme\/pkm/)
    const luhmann = read("06_Reference/Niklas-Luhmann/index.html")
    expect(luhmann).toMatch(/<details class="backlinks mentions">[\s\S]*?href="\/01_Fleeting\/01_Fleeting"/)
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
    expect(search).toContain('<option value="03_Atomic">⚛️ Nguyên tử (3)</option>')
    expect(search).toContain('<option value="notion">notion (1)</option>')
    const graph = home.match(/<div class="filters" data-filters="graph">[\s\S]*?<\/div>/)![0]
    expect(graph).toContain('data-filter="tag"')
    expect(graph).toContain('<option value="theme/pkm">#theme/pkm (2)</option>')
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

  test("note types show their icon and label, and shape the card", () => {
    expect(read("06_Reference/Niklas-Luhmann/index.html")).toContain("🧑‍🔬 Nhân vật")
    const card = read("06_Reference/index.html").match(/<article class="index-card" data-type="person">[\s\S]*?<\/article>/)![0]
    expect(card).toContain('<span class="index-card-avatar" aria-hidden="true">NL</span>')
    expect(card).toContain("🧑‍🔬 Nhân vật")
  })

  test("sidebars have their own toggles; the right one only where there is a rail", () => {
    expect(read("03_Atomic/Zettelkasten/index.html")).toContain('data-sidebar-toggle="right"')
    expect(read("tags/index.html")).toContain('data-sidebar-toggle="left"')
    expect(read("tags/index.html")).not.toContain('data-sidebar-toggle="right"')
  })

  test("note pages are one stack column and offer the stacked mode", () => {
    const html = read("03_Atomic/Zettelkasten/index.html")
    expect(html).toMatch(/<div class="stack-row" data-stack-row><div class="stack-col" data-stack-col data-url="\/03_Atomic\/Zettelkasten"/)
    expect(html).toContain("data-stack-toggle")
    expect(read("tags/index.html")).not.toContain("data-stack-toggle")
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

  test("theme accents and fonts override both looks, and the vault stylesheet loads last", () => {
    const html = read("index.html")
    expect(html).toContain("--accent:#7c3aed")
    expect(html).toContain(':root[data-theme="dark"][data-theme="dark"]{--accent:#c4b5fd')
    expect(html).toContain('--font-ui:"Fraunces", system-ui, sans-serif')
    expect(html).toContain("https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700;800&amp;display=swap")
    expect(html.indexOf('href="/custom.css"')).toBeGreaterThan(html.lastIndexOf('rel="stylesheet" href="/_astro/'))
    expect(read("custom.css")).toContain(".note-title { letter-spacing: 0.01em; }")
  })

  test("favicon and robots.txt come from the config", () => {
    expect(read("favicon.svg")).toContain(">K</text>")
    expect(read("robots.txt")).toContain("Sitemap: https://notes.dynamotn.dev/sitemap-index.xml")
  })

  test("note pages describe themselves as JSON-LD articles, the home page as a website", () => {
    const ld = (html: string) =>
      [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
    const [article, crumbs] = ld(read("03_Atomic/Zettelkasten/index.html"))
    expect(article).toMatchObject({ "@type": "Article", url: "https://notes.dynamotn.dev/03_Atomic/Zettelkasten" })
    expect(crumbs["@type"]).toBe("BreadcrumbList")
    expect(ld(read("index.html"))[0]["@type"]).toBe("WebSite")
    expect(ld(read("tags/index.html"))).toEqual([])
  })

  test("webmentions are received through webmention.io and listed under notes", () => {
    const note = read("03_Atomic/Zettelkasten/index.html")
    expect(note).toContain('<link rel="webmention" href="https://webmention.io/notes.dynamotn.dev/webmention">')
    expect(note).toContain('<link rel="me" href="https://mastodon.example/@tester">')
    expect(note).toContain('<meta name="fediverse:creator" content="@tester@mastodon.example">')
    expect(note).toContain('data-webmentions="https://notes.dynamotn.dev/03_Atomic/Zettelkasten"')
    expect(read("tags/index.html")).not.toContain("data-webmentions")
  })

  test("a print stylesheet keeps only the note, with external link targets spelled out", () => {
    const css = (fs.readdirSync(path.join(out, "_astro")) as string[])
      .filter((f) => f.endsWith(".css"))
      .map((f) => read(`_astro/${f}`))
      .join("\n")
    const print = css.slice(css.indexOf("@media print"))
    expect(print).toContain(".site-header")
    expect(print).toContain('content:" (" attr(href) ")"')
  })

  test("the site is installable and registers a service worker for offline reading", () => {
    const home = read("index.html")
    expect(home).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(home).toContain("data-offline")
    expect(JSON.parse(read("manifest.webmanifest")).name).toBe("Khu vườn thử nghiệm")
    expect(read("sw.js")).toContain('self.addEventListener("fetch"')
    for (const icon of ["icon-192.png", "icon-512.png"]) expect(exists(icon)).toBe(true)
  })

  test("images get their size and resized WebP copies smaller than the original", () => {
    const img = read("07_Project/Blog-post/index.html").match(/<img src="\/assets\/_assets\/images\/wide.png"[^>]*>/)![0]
    expect(img).toContain('width="1200" height="600"')
    expect(img).toContain(
      'srcset="/assets/_assets/images/wide.png.w480.webp 480w, /assets/_assets/images/wide.png.w960.webp 960w, /assets/_assets/images/wide.png 1200w"',
    )
    const webp = fs.readFileSync(path.join(out, "assets/_assets/images/wide.png.w960.webp"))
    expect(webp.subarray(8, 12).toString()).toBe("WEBP")
    expect(exists("assets/_assets/images/wide.png.w1600.webp")).toBe(false)
    // A 1×1 image has nothing smaller to offer.
    expect(exists("assets/_assets/images/diagram.png.w480.webp")).toBe(false)
  })

  test("problems shown while writing in datme dev never reach the built site", () => {
    expect(read("03_Atomic/Zettelkasten/index.html")).not.toMatch(/class="dev-problems/)
  })

  test("every folder and tag has its own feed, linked from its page", () => {
    const folder = read("03_Atomic/index.xml")
    expect(folder).toContain("<title>Atomic · Khu vườn thử nghiệm</title>")
    expect(folder).toMatch(/\/03_Atomic\/Zettelkasten\/?<\/link>/)
    expect(folder).not.toContain("Niklas-Luhmann")
    expect(read("tags/type/blog/index.xml")).toMatch(/\/07_Project\/Blog-post\/?<\/link>/)
    expect(exists("en-US/tags/theme/pkm/index.xml")).toBe(true)
    expect(read("03_Atomic/index.html")).toContain('<link rel="alternate" type="application/rss+xml" title="Atomic · Khu vườn thử nghiệm" href="/03_Atomic/index.xml">')
    expect(read("tags/type/blog/index.html")).toContain('href="/tags/type/blog/index.xml"')
  })

  test("the recent page lists notes by the day they last changed, newest first", () => {
    const html = read("recent/index.html")
    const dates = [...html.matchAll(/<time datetime="([^"]+)">/g)].map((m) => m[1])
    expect(dates.length).toBeGreaterThan(1)
    expect(dates).toEqual([...dates].sort().reverse())
    expect(html).toMatch(/Zettelkasten<\/a><span class="change is-updated">vừa tưới<\/span>/)
    expect(exists("en-US/recent/index.html")).toBe(true)
  })

  test("notes of a series show their place in it and link to the parts around them", () => {
    const first = read("07_Project/Blog-post/index.html")
    expect(first).toMatch(/<span class="series-label">Phần 1\/2 của<\/span> <a class="internal" href="\/07_Project\/Blog-post">Writing datme<\/a>/)
    expect(first).toMatch(/<a class="internal series-next" href="\/03_Atomic\/Code" rel="next">/)
    expect(first).not.toContain("series-prev")
    const second = read("03_Atomic/Code/index.html")
    expect(second).toMatch(/<li aria-current="page">Code<\/li>/)
    expect(second).toMatch(/<a class="internal series-prev" href="\/07_Project\/Blog-post" rel="prev">/)
    // The series fields are not repeated in the properties block.
    expect(second).not.toContain("<dt>series")
  })

  test("RSS feeds and the sitemap are generated", () => {
    expect(read("index.xml")).toContain("<item>")
    expect(read("en-US/index.xml")).toContain("<language>en-US</language>")
    expect(exists("sitemap-index.xml")).toBe(true)
  })
})
