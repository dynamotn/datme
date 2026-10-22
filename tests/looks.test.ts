import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Window } from "happy-dom"

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

describe("broadsheet look", () => {
  test("the home is a front page: a masthead dated by the newest story, a lead, then a section per top folder", () => {
    const html = read("index.html")
    expect(html).toContain('data-look="broadsheet"')
    expect(lookSheet(html)).toBe("broadsheet")
    const masthead = html.match(/<header class="bs-masthead">[\s\S]*?<\/header>/)![0]
    expect(masthead).toContain('<time datetime="2026-10-21T00:00:00.000Z">Wednesday, October 21, 2026</time>')
    expect(masthead).toContain('<h1 class="bs-title">Looks</h1>')
    const lead = html.match(/<article class="bs-story bs-lead">[\s\S]*?<\/article>/)![0]
    expect(lead).toContain('<p class="bs-kicker">Essays</p>')
    expect(lead).toContain('<h2 class="bs-headline"><a class="internal" href="/Essays/On-walking">On walking</a></h2>')
    expect(lead).toMatch(/<img class="bs-picture" src="[^"]*road[^"]*" alt=""/)
    expect(lead).toContain('<p class="bs-dek">Why the slow way round is often the quickest way to think.</p>')
    const labels = [...html.matchAll(/<h2 class="bs-section-label"><a href="([^"]+)">([^<]+)<\/a><\/h2>/g)].map((m) => [m[1], m[2]])
    expect(labels).toEqual([
      ["/News/", "News"],
      ["/Shell/", "Shell"],
      ["/Plans/", "Plans"],
      ["/Wiki/", "Wiki"],
      ["/Reader/", "Reader"],
      ["/Zine/", "Zine"],
      ["/Atlas/", "Atlas"],
      ["/03-Atoms/", "Atoms"],
    ])
    expect(html).toContain('<h3 class="bs-headline"><a class="internal" href="/News/Harbour">Harbour</a></h3>')
  })

  test("a story names its section above the headline", () => {
    const html = read("Essays/On-walking/index.html")
    expect(html).toContain('<p class="bs-kicker"><a href="/Essays/">Essays</a></p>')
    expect(read("Wiki/Zettelkasten/index.html")).not.toContain("bs-kicker")
  })

  test("a folder's page leads with its newest note and runs the rest under one label", () => {
    const html = read("Essays/index.html")
    expect(html).toContain('<article class="bs-story bs-lead">')
    expect(html).not.toContain("bs-section-label")
    expect(read("Wiki/index.html")).not.toContain("bs-front")
  })

  test("a stream folder keeps its stream, newest first, for the stylesheet to lay out", () => {
    const html = read("News/index.html")
    expect(html).not.toContain("bs-front")
    const titles = [...html.matchAll(/<article class="stream-item"[\s\S]*?<a class="internal" href="[^"]+">([^<]+)<\/a>/g)].map((m) => m[1])
    expect(titles).toEqual(["Harbour", "Market", "Bridge"])
  })
})

describe("zine look", () => {
  test("a note in a zine folder links its sheet and adds no markup of its own", () => {
    const html = read("Zine/Cut-and-paste/index.html")
    expect(html).toContain('data-look="zine"')
    expect(lookSheet(html)).toBe("zine")
    expect(html).toContain('<meta name="theme-color" content="#ecebe6" media="(prefers-color-scheme: light)"')
    expect(html).not.toMatch(/atlas-region|catalog-call/)
  })
})

describe("atlas look", () => {
  test("a note names its region, its top folder, above its title", () => {
    const html = read("Atlas/North/Harbour-town/index.html")
    expect(html).toContain('data-look="atlas"')
    expect(lookSheet(html)).toBe("atlas")
    expect(html).toContain('<p class="atlas-region"><span>Region</span> <a href="/Atlas/">Atlas</a></p>')
    expect(html.indexOf('class="atlas-region"')).toBeLessThan(html.indexOf('class="note-title'))
    expect(read("Wiki/Zettelkasten/index.html")).not.toContain("atlas-region")
  })

  test("a folder page names its region, unlinked on the region's own page", () => {
    expect(read("Atlas/North/index.html")).toContain('<p class="atlas-region"><span>Region</span> <a href="/Atlas/">Atlas</a></p>')
    expect(read("Atlas/index.html")).toContain('<p class="atlas-region"><span>Region</span> Atlas</p>')
  })
})

describe("catalog look", () => {
  test("a note is filed under the call number of its folders", () => {
    const html = read("03-Atoms/Code/Hash-map/index.html")
    expect(html).toContain('data-look="catalog"')
    expect(lookSheet(html)).toBe("catalog")
    expect(html).toContain('<p class="catalog-call"><span>Call no.</span> <span class="catalog-call-no">03.ATO · Code</span></p>')
    expect(read("03-Atoms/Atom/index.html")).toContain('<span class="catalog-call-no">03.ATO</span>')
  })

  test("a folder page is a drawer: its label, and a call number on each drawer inside", () => {
    const html = read("03-Atoms/index.html")
    expect(html).toContain('<p class="catalog-drawer"><span>Drawer</span> <span class="catalog-call-no">03.ATO</span></p>')
    expect(html).toMatch(/<a class="folder-card" href="\/03-Atoms\/Code\/">[\s\S]*?Code<small class="catalog-call-no">03.ATO · Code<\/small><span>1<\/span><\/a>/)
    expect(read("Atlas/index.html")).not.toContain("catalog-")
  })
})

describe("eink look", () => {
  test("a note in an eink folder links its sheet, opens light and offers to turn its pages", () => {
    const html = read("Reader/Long-read/index.html")
    expect(html).toContain('data-look="eink"')
    expect(html).not.toContain("data-scheme-default")
    expect(lookSheet(html)).toBe("eink")
    expect(html).toContain('<meta name="theme-color" content="#f4f4f4" media="(prefers-color-scheme: light)"')
    expect(html).toMatch(/<button class="prefs-item paged-toggle" type="button" data-paged-toggle aria-pressed="false">[\s\S]*?Turn pages\s*<\/button>/)
    const bar = html.match(/<nav class="paged-bar"[\s\S]*?<\/nav>/)![0]
    expect(bar).toContain('aria-label="Pages" hidden')
    expect(bar).toContain('<button type="button" data-paged-prev aria-label="Previous page" title="Previous page">')
    expect(bar).toContain('<span data-paged-count data-template="Page {n} of {total}" aria-live="polite"></span>')
    // The page bar follows the note; the text stays one article in reading order.
    expect(html.indexOf("</article>")).toBeLessThan(html.indexOf('class="paged-bar"'))
    expect(html).toContain('doc.documentElement.classList.toggle("paged", localStorage.getItem("paged") === "1")')
  })

  test("only a note that can be shown in the eink style can be paged", () => {
    for (const page of ["Shell/Uptime/index.html", "Reader/index.html", "index.html"]) {
      expect(read(page)).not.toContain("data-paged-toggle")
      expect(read(page)).not.toContain("paged-bar")
    }
  })
})

describe("accessibility of the looks", () => {
  const axeSource = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8")
  // As tests/a11y.test.ts: serious and critical axe violations of the markup, scripts not run.
  const PAGES = ["index.html", "Essays/index.html", "Essays/On-walking/index.html", "News/index.html", "Wiki/Zettelkasten/index.html", "Shell/Uptime/index.html", "Plans/Pump/index.html", "Zine/Cut-and-paste/index.html", "Atlas/index.html", "Atlas/North/Harbour-town/index.html", "03-Atoms/index.html", "03-Atoms/Code/Hash-map/index.html", "Reader/Long-read/index.html", "Reader/index.html"]
  for (const page of PAGES) {
    test(`${page} has no serious or critical axe violations`, async () => {
      const window = new Window({ url: "https://example.com/", settings: { disableJavaScriptEvaluation: false } })
      window.document.write(read(page).replace(/<script\b[\s\S]*?<\/script>/g, ""))
      window.eval(axeSource)
      type Result = { violations: { id: string; impact: string | null }[] }
      const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<Result> } }).axe
      const res = await axe.run(window.document, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] })
      await window.happyDOM.close()
      expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([])
    }, 30_000)
  }
})
