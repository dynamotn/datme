import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  cvHtml,
  faqHtml,
  galleryHtml,
  linksHtml,
  plain,
  quotesHtml,
  recipeHtml,
  timelineHtml,
  usesHtml,
  withoutBases,
} from "../src/lib/note-layouts"

describe("layout transforms", () => {
  test("a gallery gathers runs of picture-only paragraphs into one grid", () => {
    const html = galleryHtml(
      `<p>Intro</p>\n<p><span class="image-embed"><img src="/a.png" alt="Fog"></span>\n<span class="image-embed"><img src="/b.png" alt=""></span></p>\n<p><img src="/c.png" alt=""></p>\n<p>Outro <img src="/d.png" alt=""></p>`,
    )
    expect(html).toBe(
      `<p>Intro</p>\n<div class="gallery-grid"><figure class="gallery-item"><img src="/a.png" alt="Fog"><figcaption>Fog</figcaption></figure><figure class="gallery-item"><img src="/b.png" alt=""></figure><figure class="gallery-item"><img src="/c.png" alt=""></figure></div><p>Outro <img src="/d.png" alt=""></p>`,
    )
  })

  test("a résumé puts each H2 section beside its heading, after the summary", () => {
    expect(cvHtml(`<p>Hi</p><h2 id="a">A</h2><p>x</p><h2>B</h2><ul><li>y</li></ul>`)).toBe(
      `<div class="cv-summary"><p>Hi</p></div>` +
        `<section class="cv-section"><h2 id="a">A</h2><div class="cv-body"><p>x</p></div></section>` +
        `<section class="cv-section"><h2>B</h2><div class="cv-body"><ul><li>y</li></ul></div></section>`,
    )
    expect(cvHtml(`<h2>Only</h2><p>x</p>`)).not.toContain("cv-summary")
  })

  test("a timeline puts each H2 on the line, after the introduction", () => {
    expect(timelineHtml(`<p>Hi</p><h2>2015</h2><p>x</p>`)).toBe(
      `<p>Hi</p><ol class="life-timeline"><li class="life-event"><h2>2015</h2><div class="life-body"><p>x</p></div></li></ol>`,
    )
    expect(timelineHtml(`<p>No moments</p>`)).toBe(`<p>No moments</p>`)
  })

  test("only lists of links become buttons", () => {
    const links = `<ul>\n<li><a href="/a">A</a> — note</li>\n<li> <a class="internal" href="/b">B</a></li>\n</ul>`
    expect(linksHtml(links)).toStartWith('<ul class="link-hub">')
    expect(linksHtml(`<ul><li>text</li><li><a href="/a">A</a></li></ul>`)).toStartWith("<ul>")
    expect(linksHtml(`<ul><li><a href="/a">A</a><ul><li>x</li></ul></li></ul>`)).not.toContain("link-hub")
  })

  test("uses: lists of names in bold become cards, other lists stay", () => {
    expect(usesHtml(`<ul><li><strong>Vim</strong> — editor</li></ul>`)).toBe(`<ul class="uses-grid"><li><strong>Vim</strong> — editor</li></ul>`)
    expect(usesHtml(`<ul><li>plain</li></ul>`)).toBe(`<ul><li>plain</li></ul>`)
  })

  test("a FAQ: each H2 opens on its answer, without its anchor", () => {
    expect(faqHtml(`<p>Hi</p><h2 id="q">Q?<a class="heading-anchor" href="#q">#</a></h2><p>A.</p>`)).toBe(
      `<p>Hi</p><details class="faq-item"><summary><h2 id="q">Q?</h2></summary><div class="faq-answer"><p>A.</p></div></details>`,
    )
  })

  test("quotes: a wall of cards, the dashed last line as who said it", () => {
    const html = quotesHtml(
      `<p>Intro</p>\n<blockquote>\n<p>Be kind.</p>\n<p>— Ann</p>\n</blockquote>\n<blockquote>\n<p>Go fast.\n— Bob</p>\n</blockquote>\n<blockquote><p>Anon.</p></blockquote>`,
    )
    expect(html.match(/<div class="quote-wall">/g)).toHaveLength(1)
    expect(html).toContain(`<blockquote><p>Be kind.</p></blockquote><figcaption>Ann</figcaption>`)
    expect(html).toContain(`<blockquote><p>Go fast.</p></blockquote><figcaption>Bob</figcaption>`)
    expect(html).toContain(`<blockquote><p>Anon.</p></blockquote></figure>`)
  })

  test("a recipe: its ingredients beside its steps, each to tick off", () => {
    const html = recipeHtml(`<p>Intro</p><h2>Ingredients</h2><ul><li>Salt</li></ul><h2>Steps</h2><ol><li>Cook</li></ol>`)
    expect(html).toBe(
      `<p>Intro</p><div class="recipe"><aside class="recipe-ingredients"><h2>Ingredients</h2><ul><li><label class="recipe-tick"><input type="checkbox"> Salt</label></li></ul></aside><div class="recipe-steps"><h2>Steps</h2><ol><li>Cook</li></ol></div></div>`,
    )
    expect(recipeHtml(`<h2>Steps</h2><p>x</p>`)).toBe(`<h2>Steps</h2><p>x</p>`)
  })

  test("a collection leaves out the bases it shows, nested divs and all", () => {
    expect(withoutBases(`<p>a</p><div class="base-embed"><div class="card-wall"><div>x</div></div></div><p>b</p>`)).toBe(`<p>a</p><p>b</p>`)
  })

  test("frontmatter values read as plain text, wikilinks by their alias or name", () => {
    expect(plain("[[People/Sönke Ahrens]]")).toBe("Sönke Ahrens")
    expect(plain(["[[A|Ann]]", "Bob"])).toBe("Ann, Bob")
    expect(plain(undefined)).toBe("")
  })
})

// End-to-end: a vault with a résumé, projects, books and a gallery.
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/layouts")
let out = ""
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")
// The note itself, cards of a collection included: up to the sidebar, or the footer on a page without one.
const article = (p: string) => read(p).match(/<article[\s\S]*?(?:<aside|<footer class="site-footer")/)![0]

beforeAll(() => {
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-layouts-")), "site")
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

describe("page layouts", () => {
  test("a résumé has a head of contacts and sections, and no backlinks", () => {
    const page = read("CV/index.html")
    const html = article("CV/index.html")
    expect(html).toContain('class="note layout-cv h-entry"')
    expect(html).toContain('<img class="cv-photo" src="/assets/_assets/portrait.png"')
    expect(html).toContain('<p class="cv-role">Platform engineer</p>')
    expect(html).toContain('<a href="mailto:ada@example.com">ada@example.com</a>')
    expect(html).toContain('<a href="https://github.com/example" rel="me noopener">GitHub</a>')
    expect(html).toContain("data-print")
    expect(html).toMatch(/<section class="cv-section"><h2 id="experience">[\s\S]*?<div class="cv-body">/)
    // The head already shows what the properties block would repeat.
    expect(html).not.toContain('class="properties')
    expect(page).not.toContain('class="backlinks"')
  })

  test("a gallery shows its pictures as a grid, its text as text", () => {
    const html = article("Photos/index.html")
    expect(html).toContain('class="note layout-gallery h-entry"')
    expect(html.match(/<div class="gallery-grid">/g)).toHaveLength(1)
    expect(html.match(/<figure class="gallery-item">/g)).toHaveLength(3)
    expect(html).toContain("<figcaption>Morning fog</figcaption>")
    expect(html).toContain("<p>Text between albums stays text.</p>")
  })

  test("projects of the folder, grouped by status in reading order", () => {
    const html = article("Projects/Projects/index.html")
    const groups = [...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])
    expect(groups).toEqual(["active", "done", "someday"])
    expect(html).toContain('<h2 class="collection-title">In progress <span class="count">1</span>')
    expect(html).toContain('<p class="project-meta">2025 – now</p>')
    expect(html).toContain('<p class="project-meta">2019 – 2021</p>')
    expect(html).toContain("<li>TypeScript</li><li>Astro</li>")
    expect(html).toContain('<a href="https://github.com/example/garden" rel="noopener">github.com ↗</a>')
    expect(html).toContain('<img src="/assets/_assets/cover.png"')
    expect(html).not.toContain('href="/Projects/Projects"')
  })

  test("a folder note with a layout lays out its folder page", () => {
    const html = read("Projects/index.html")
    expect(html).toContain('<div class="collection collection-projects">')
    expect(html).not.toContain('class="note-list"')
  })

  test("books by tag on a shelf: covers, authors and ratings", () => {
    const html = article("Books/index.html")
    const groups = [...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])
    expect(groups).toEqual(["reading", "read"])
    expect(html).toContain('<span class="book-cover-text">How to Take Smart Notes</span>')
    expect(html).toContain('<span class="book-author">Sönke Ahrens, 2017</span>')
    expect(html).toContain('aria-label="Rated 4/5">★★★★<span class="book-rating-rest">★</span>')
  })

  test("a timeline of moments", () => {
    const html = article("Life/index.html")
    expect(html).toContain('class="note layout-timeline h-entry"')
    expect(html.match(/<li class="life-event">/g)).toHaveLength(2)
  })

  test("a page of links: an avatar, a tagline and buttons, no dates", () => {
    const html = article("Links/index.html")
    expect(html).toContain('<header class="hub-head"><img class="hub-avatar" src="/assets/_assets/portrait.png"')
    expect(html).toContain('<p class="hub-tagline">Find me elsewhere.</p>')
    expect(html.match(/<ul class="link-hub">/g)).toHaveLength(1)
    expect(html).not.toContain('class="note-head"')
  })

  test("movies by folder: directors, release years and the watchlist first after watching", () => {
    const html = article("Movies/index.html")
    const groups = [...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])
    expect(groups).toEqual(["to-watch", "watched"])
    expect(html).toContain('<span class="book-author">Andrei Tarkovsky, 1979</span>')
  })

  test("uses, now, FAQ and quotes", () => {
    expect(article("Uses/index.html").match(/<ul class="uses-grid">/g)).toHaveLength(1)
    const now = article("Now/index.html")
    expect(now).toContain('<time datetime="2020-01-02T00:00:00.000Z">Last updated Jan 2, 2020</time>')
    // Old enough to warn, at build time and again in the browser.
    expect(now).toMatch(/<p class="outdated" role="note" data-outdated [^>]*data-after="0.25">/)
    expect(article("FAQ/index.html").match(/<details class="faq-item">/g)).toHaveLength(2)
    expect(article("Quotes/index.html").match(/<figure class="quote-card">/g)).toHaveLength(3)
  })

  test("talks by year, newest first, with their event and links", () => {
    const html = article("Talks/Talks/index.html")
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["2024", "2023"])
    expect(html).toContain('<span class="talk-meta">RustConf</span>')
    expect(html).toContain('<a href="https://slides.example/gardens" rel="noopener">Slides ↗</a>')
    expect(html).toContain('<span class="talk-meta">Hà Nội meetup</span>')
  })

  test("recipes by category; a recipe's page has its cover and two columns", () => {
    expect(article("Recipes/Recipes/index.html")).toContain('<p class="project-meta">⏱ 6 h · 🍽 4</p>')
    // The ingredients are an aside of their own, so the whole page is read.
    const page = read("Recipes/Phở-bò/index.html")
    expect(page).toContain('<div class="item-head"><img class="item-cover" src="/assets/_assets/road.png"')
    expect(page).toContain('<aside class="recipe-ingredients">')
  })

  test("places on a map, grouped by country", () => {
    const html = article("Places/index.html")
    expect(html).toContain('class="map-canvas collection-map" data-map="[{&quot;lat&quot;:35.01')
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["japan", "vietnam"])
  })

  test("a shelf names its own statuses, per language, and fields", () => {
    const html = article("Games/index.html")
    expect(html).toContain('<h2 class="collection-title">Playing now <span class="count">1</span>')
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["playing", "backlog"])
    expect(html).toContain('<span class="book-author">Switch</span>')
  })

  test("a collection embedding a base shows what the base finds, in its groups, without the table", () => {
    const html = article("Shelf-by-base/index.html")
    expect([...html.matchAll(/data-group="([^"]+)"/g)].map((m) => m[1])).toEqual(["read", "reading"])
    expect(html).not.toContain("base-embed")
  })

  test("a gallery and a timeline show the notes their base finds", () => {
    const gallery = article("Covers/index.html")
    expect(gallery).toContain('<figure class="gallery-item"><a class="internal" href="/Reading/Deep-Work"')
    expect(gallery).not.toContain("base-embed")
    const timeline = article("Reading-log/index.html")
    const dates = [...timeline.matchAll(/<p class="life-when"><time datetime="([^"]+)"/g)].map((m) => m[1].slice(0, 10))
    expect(dates.slice(0, 2)).toEqual(["2023-03-01", "2024-09-10"])
  })

  test("a book of a collection shows its cover upright beside its title, with its author and rating", () => {
    const html = article("Reading/Deep-Work/index.html")
    expect(html).toContain('<div class="item-head is-upright"><img class="item-cover" src="/assets/_assets/cover.png"')
    expect(html).toContain('<p class="item-byline">Cal Newport</p>')
    expect(html).toContain('<span class="chip item-status">Read</span>')
  })

  test("a note without a layout keeps the usual page", () => {
    const html = read("Sketchbook/index.html")
    expect(html).not.toContain("layout-")
    expect(html).not.toContain("item-head")
    expect(html).toContain('class="backlinks"')
  })

  test("a résumé and a link page stand alone", () => {
    for (const [page, look] of [["CV/index.html", "resume"], ["Links/index.html", "classic"]] as const) {
      const html = read(page)
      expect(html).toContain(`data-look="${look}"`)
      expect(html).toContain('data-chrome="minimal"')
      for (const gone of ['class="main-nav"', "data-open-search", "sidebar-left", "sidebar-right", 'class="crumbs"', "data-search-dialog", "data-graph-dialog"])
        expect(html).not.toContain(gone)
      expect(html).toContain("data-theme-toggle")
    }
  })

  test("a gallery starts dark", () => {
    const html = read("Photos/index.html")
    expect(html).toContain('data-look="darkroom"')
    expect(html).toContain('data-scheme-default="dark"')
  })

  test("collections and timelines keep the header but drop the rail", () => {
    for (const page of ["Life/index.html", "Projects/index.html"]) {
      const html = read(page)
      expect(html).toContain('data-chrome="full-norail"')
      expect(html).toContain('class="main-nav"')
      expect(html).not.toContain("sidebar-right")
    }
    expect(read("FAQ/index.html")).toContain('data-chrome="full"')
  })

  test("a note can override its layout's style and frame", () => {
    const html = read("Styled-CV/index.html")
    expect(html).toContain('data-look="garden"')
    expect(html).toContain('data-chrome="full"')
  })
})
