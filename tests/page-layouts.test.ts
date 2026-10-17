import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { cvHtml, galleryHtml, plain } from "../src/lib/note-layouts"

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
// The note itself, cards of a collection included: up to the sidebar.
const article = (p: string) => read(p).match(/<article[\s\S]*?<aside/)![0]

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
    expect(html).toContain('class="note layout-cv"')
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
    expect(html).toContain('class="note layout-gallery"')
    expect(html.match(/<div class="gallery-grid">/g)).toHaveLength(1)
    expect(html.match(/<figure class="gallery-item">/g)).toHaveLength(3)
    expect(html).toContain("<figcaption>Morning fog</figcaption>")
    expect(html).toContain("<p>Text between albums stays text.</p>")
  })

  test("projects of the folder, grouped by status in reading order", () => {
    const html = article("Projects/Projects/index.html")
    const groups = [...html.matchAll(/data-status="([^"]+)"/g)].map((m) => m[1])
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
    const groups = [...html.matchAll(/data-status="([^"]+)"/g)].map((m) => m[1])
    expect(groups).toEqual(["reading", "read"])
    expect(html).toContain('<span class="book-cover-text">How to Take Smart Notes</span>')
    expect(html).toContain('<span class="book-author">Sönke Ahrens, 2017</span>')
    expect(html).toContain('aria-label="Rated 4/5">★★★★<span class="book-rating-rest">★</span>')
  })

  test("a note without a layout keeps the usual page", () => {
    const html = read("Reading/Deep-Work/index.html")
    expect(html).not.toContain("layout-")
    expect(html).toContain('class="backlinks"')
  })
})
