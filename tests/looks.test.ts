import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// End-to-end: a vault with a folder in each style, built once.
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/looks")
let out = ""
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")
/** The stylesheet a page links for its look, by the name of its source file. */
const lookSheet = (html: string) => html.match(/<link rel="stylesheet" href="[^"]*\/([a-z]+)\.[^"]*\.css" data-css="3"/)?.[1]

beforeAll(() => {
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-looks-")), "site")
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

describe("terminal look", () => {
  test("a note in a terminal folder links its sheet and opens dark", () => {
    const html = read("Shell/Uptime/index.html")
    expect(html).toContain('data-look="terminal"')
    expect(html).toContain('data-scheme-default="dark"')
    expect(lookSheet(html)).toBe("terminal")
    expect(html).toContain('<meta name="theme-color" content="#090c09" media="(prefers-color-scheme: dark)"')
  })
})

describe("blueprint look", () => {
  test("a note in a blueprint folder links its sheet, opens dark and keeps its diagrams", () => {
    const html = read("Plans/Pump/index.html")
    expect(html).toContain('data-look="blueprint"')
    expect(html).toContain('data-scheme-default="dark"')
    expect(lookSheet(html)).toBe("blueprint")
    expect(html).toContain('<pre class="mermaid">')
    expect(html).toContain('<figure class="diagram diagram-d2">')
  })
})

describe("wiki look", () => {
  test("a note boxes its picture and properties beside the text, its contents above it", () => {
    const html = read("Wiki/Zettelkasten/index.html")
    expect(html).toContain('data-look="wiki"')
    expect(lookSheet(html)).toBe("wiki")
    const box = html.match(/<div class="infobox"><table>[\s\S]*?<\/table><\/div>/)![0]
    expect(box).toContain("<caption>Zettelkasten</caption>")
    expect(box).toMatch(/<td colspan="2" class="infobox-image"><img src="[^"]*road[^"]*"/)
    expect(box).toMatch(/<th scope="row">inventor<\/th><td><a href="\/Wiki\/Niklas-Luhmann" class="internal">Niklas Luhmann<\/a>/)
    expect(box).toContain('<th scope="row">year</th><td><span>1951</span>')
    // The infobox replaces the properties drawer and the banner; the box comes before the text.
    expect(html).not.toContain('<details class="properties">')
    expect(html.indexOf('class="infobox"')).toBeLessThan(html.indexOf('class="wiki-toc"'))
    expect(html.indexOf('class="wiki-toc"')).toBeLessThan(html.indexOf('class="prose e-content"'))
  })

  test("related notes are listed under See also", () => {
    const html = read("Wiki/Zettelkasten/index.html")
    expect(html).toMatch(/<section class="backlinks related"[^>]*>\s*<h2[^>]*>See also<\/h2>/)
  })

  test("a note without properties or a picture has no infobox", () => {
    const html = read("Wiki/Niklas-Luhmann/index.html")
    expect(html).toContain('<th scope="row">born</th>')
    expect(read("index.html")).not.toContain('class="infobox"')
  })
})
