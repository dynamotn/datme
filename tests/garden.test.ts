import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Window } from "happy-dom"

// A site in the garden style: tiles sized by stage, recently tended notes first.
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/garden")
let out = ""
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")

beforeAll(() => {
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-garden-")), "site")
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

describe("garden style", () => {
  test("the home is a garden: recently tended, paths in, then the bed", () => {
    const home = read("index.html")
    expect(home).toContain('data-look="garden"')
    const order = ["garden-gate", "garden-recent", "garden-paths", "garden-bed", "garden-beds"].map((c) => home.indexOf(`class="${c}`))
    expect(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1]))).toBe(true)
    expect(home).not.toContain("index-card")
    expect(home).not.toContain("hero-stats")
  })

  test("every listed note is a tile in the bed, which opens on a mature note", () => {
    const bed = read("index.html").split('class="garden-bed"')[1]
    expect((bed.match(/class="garden-tile"/g) ?? []).length).toBe(6)
    const first = bed.match(/<article[^>]*>/)?.[0] ?? ""
    expect(first).toContain('data-size="large"')
    expect(first).toContain('data-stage="Evergreen"')
  })

  test("with fewer than 60 notes, the walk-the-garden button stays hidden", () => {
    expect(read("index.html")).toMatch(/<button[^>]*data-garden-more[^>]*hidden/)
  })

  test("tag and folder pages are garden beds; a classic folder is not", () => {
    expect(read("tags/pkm/index.html")).toContain('class="garden-tile"')
    expect(read("Evergreen/index.html")).toContain('class="garden-bed"')
    expect(read("Writing/index.html")).toContain('data-look="classic"')
  })

  test("the filters follow the script's contract and start hidden", () => {
    const home = read("index.html")
    expect(home).toMatch(/<div[^>]*data-garden[^>]*data-cap="60"/)
    expect(home).toMatch(/<div class="garden-filters" data-garden-filters hidden>/)
    const chips = [...home.matchAll(/<button[^>]*data-garden-chip[^>]*>/g)].map((m) => m[0])
    expect(chips[0]).toContain('data-kind="all"')
    expect(chips[0]).toContain('data-value=""')
    expect(chips[0]).toContain('aria-pressed="true"')
    expect(chips.slice(1).map((c) => c.match(/data-value="([^"]*)"/)![1])).toEqual(["Seeds", "Sources", "Evergreen"])
    expect(chips.slice(1).every((c) => c.includes('aria-pressed="false"'))).toBe(true)
    expect(home).toMatch(/<select[^>]*data-garden-tag[^>]*>\s*<option value="">/)
    expect(home).toMatch(/data-folder="Evergreen"[^>]*data-tags="pkm garden writing extra"/)
    expect(read("Evergreen/index.html")).not.toContain("data-cap")
  })

  test("tiles grow with the note: dates from medium up, description and three tags on large", () => {
    const bed = read("index.html").split('class="garden-bed"')[1]
    const tile = (title: string) => bed.split("<article").find((a) => a.includes(`>${title}</a>`))!
    expect(tile("Idea")).toContain('data-size="small"')
    expect(tile("Idea")).not.toContain("<time")
    expect(tile("Book notes")).toMatch(/<time datetime="2026-07-01T[^"]*" data-tended title="[^"]+">/)
    const large = tile("Gardens")
    expect(large).toContain('class="garden-tile-desc"')
    expect(large).toContain("Why a notebook can grow like a garden.")
    expect((large.match(/class="garden-tag"/g) ?? []).length).toBe(3)
    expect(large).not.toContain("<img")
  })

  test("the recently tended row holds small dated tiles, newest first", () => {
    const row = read("index.html").split('class="garden-recent"')[1].split("</section>")[0]
    expect((row.match(/class="garden-tile is-recent"/g) ?? []).length).toBe(6)
    expect(row.indexOf(">Idea<")).toBeLessThan(row.indexOf(">Question<"))
    expect(row).toContain("data-tended")
    expect(row).not.toContain('data-size="large"')
  })

  test("note pages say when a note was planted and last tended, and offer paths", () => {
    const html = read("Evergreen/Gardens/index.html")
    expect(html).toMatch(/Planted <time datetime="[^"]+">/)
    expect(html).toMatch(/Last tended <time datetime="[^"]+" data-tended/)
    expect(read("Seeds/Idea/index.html")).toContain("Paths from here")
    expect(read("Seeds/Idea/index.html")).toMatch(/class="backlink-stage"[^>]*>🌳/)
  })

  test("a note tended the day it was planted does not say so twice", () => {
    const html = read("Seeds/Question/index.html")
    expect(html).toMatch(/Planted <time datetime="[^"]+">/)
    expect(html).not.toContain("Last tended")
  })

  test("the garden takes the colours of the season it was built in, and the reader's script turns them", () => {
    const home = read("index.html")
    expect(home).toMatch(/<html[^>]* data-season="(spring|summer|autumn|winter)" data-hemisphere="south">/)
    expect(home).toContain("doc.documentElement.dataset.season = [")
    // Only the garden style follows the seasons.
    expect(read("Writing/index.html")).not.toContain("data-season=")
    expect(read("Sources/index.html")).not.toContain("data-season=")
  })
})

describe("herbarium style", () => {
  test("a folder in the herbarium style is a cabinet of sheets, with the garden's filters", () => {
    const html = read("Sources/index.html")
    expect(html).toContain('data-look="herbarium"')
    expect(html).toContain('class="garden-bed"')
    expect(html).toMatch(/<article class="garden-tile"[^>]*data-stage="Sources"/)
  })

  test("a note is a sheet with its label card: collected, its stage and what it was found near", () => {
    const label = read("Sources/Book-notes/index.html").match(/<aside class="specimen-label"[\s\S]*?<\/aside>/)![0]
    expect(label).toContain('aria-label="Specimen label"')
    expect(label).toContain("<h2>Book notes</h2>")
    expect(label).toContain('<dt>Collected</dt><dd><time datetime="2026-02-01T00:00:00.000Z">')
    expect(label).toContain('<dt>Stage</dt><dd><span aria-hidden="true">📖</span> Literature</dd>')
    expect(label).toContain('<dt>Found near</dt><dd><a class="internal" href="/Evergreen/Map">Map</a></dd>')
  })

  test("it keeps the garden's wording around the note", () => {
    const html = read("Sources/Book-notes/index.html")
    expect(html).toMatch(/Planted <time datetime="[^"]+">/)
    expect(html).toContain("Paths from here")
  })

  test("only the herbarium has the label", () => {
    expect(read("Evergreen/Gardens/index.html")).not.toContain("specimen-label")
  })
})

describe("paddy style", () => {
  test("a folder in the paddy style is a terrace of fields, each with its step of growth", () => {
    const html = read("Seeds/index.html")
    expect(html).toContain('data-look="paddy"')
    expect(html).toContain('class="garden-bed"')
    expect(html).toMatch(/<article class="garden-tile"[^>]*data-stage="Seeds" data-growth="0"/)
    expect(html).toContain("data-garden-filters")
  })

  test("a note keeps the garden's wording, its stage chip coloured by its step", () => {
    const html = read("Seeds/Idea/index.html")
    expect(html).toContain('data-look="paddy"')
    expect(html).toMatch(/<a class="chip stage garden-stage" data-growth="0" href="\/Seeds\/">/)
    expect(html).toMatch(/Planted <time datetime="[^"]+">/)
  })

  test("the garden's own tiles say how grown they are too, and a note without a stage says nothing", () => {
    const home = read("index.html")
    expect(home).toMatch(/data-stage="Evergreen" data-growth="3"/)
    expect(home).toMatch(/data-stage="Sources" data-growth="2"/)
    expect(home).toMatch(/data-stage data-folder="Writing"/)
  })

  // As tests/a11y.test.ts: serious and critical axe violations of the markup, scripts not run.
  for (const page of ["Seeds/index.html", "Seeds/Idea/index.html"]) {
    test(`${page} has no serious or critical axe violations`, async () => {
      const window = new Window({ url: "https://example.com/", settings: { disableJavaScriptEvaluation: false } })
      window.document.write(read(page).replace(/<script\b[\s\S]*?<\/script>/g, ""))
      window.eval(fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8"))
      type Result = { violations: { id: string; impact: string | null }[] }
      const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<Result> } }).axe
      const res = await axe.run(window.document, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] })
      await window.happyDOM.close()
      expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([])
    }, 30_000)
  }
})
