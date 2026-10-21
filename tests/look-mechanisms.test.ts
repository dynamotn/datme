import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Window } from "happy-dom"

// A site readers can restyle, with a style per tag, a theme pack and a bento home: built once, then read and checked with axe.
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/look-mechanisms")
let out = ""
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")
const axeSource = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8")

beforeAll(() => {
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-look-mechanisms-")), "site")
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
}, 180_000)

afterAll(() => fs.rmSync(path.dirname(out), { recursive: true, force: true }))

/** Serious and critical axe violations of a built page, scripts not run. */
async function violations(page: string): Promise<string[]> {
  const window = new Window({ url: "https://looks.example/", settings: { disableJavaScriptEvaluation: false } })
  window.document.write(read(page).replace(/<script\b[\s\S]*?<\/script>/g, ""))
  window.eval(axeSource)
  const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; impact: string | null; help: string }[] }> } }).axe
  const res = await axe.run(window.document, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] })
  await window.happyDOM.close()
  return res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)
}

describe("a bento home", () => {
  const home = () => read("index.html")
  const tile = (name: string) => home().split(`class="bento-tile bento-${name}"`)[1]?.split("</section>")[0] ?? ""
  test("the tiles come in the order of datme.yaml, each once, after the home note's intro", () => {
    const order = [...home().matchAll(/class="bento-tile bento-(\w+)"/g)].map((m) => m[1])
    expect(order).toEqual(["now", "recent", "random", "stats", "graph", "stream", "tags"])
    expect(home().indexOf('class="bento-head"')).toBeLessThan(home().indexOf('class="bento"'))
    expect(home()).toContain("A garden to dress in every style.")
    // The home note's sections still follow, as shelves.
    expect(home()).toMatch(/class="shelf prose"[^>]*>\s*<h2[^>]*>Where to start/)
  })
  test("now, recent, random and stats", () => {
    expect(tile("now")).toContain('href="/Now"')
    expect(tile("now")).toContain("Writing about styles and planting tomatoes.")
    expect(tile("recent")).toContain('href="/recent"')
    expect(tile("recent")).not.toContain('href="/Now"')
    expect(tile("random")).toMatch(/<button class="bento-dice" type="button" data-random>/)
    expect(tile("stats")).toMatch(/<dt>notes<\/dt><dd>7<\/dd>/)
    expect(tile("stats")).toContain('href="/stats"')
  })
  test("a graph around the most linked note, the newest short notes and the most used tags", () => {
    expect(tile("graph")).toMatch(/<canvas data-graph="local" data-lang="en-US" data-current="\/Notes\/(Haiku|Plain)"/)
    expect(tile("graph")).not.toContain("panel-title")
    const stream = tile("stream")
    expect(stream.indexOf("Evening")).toBeLessThan(stream.indexOf("Morning"))
    expect(stream).toContain('href="/Thoughts/"')
    expect(tile("tags")).toMatch(/href="\/tags\/poem">poem <small>2<\/small>/)
  })
})

describe("a theme pack", () => {
  test("a style of the pack draws as its base, with its own stylesheet after the base's", () => {
    const page = read("Ink/Letter/index.html")
    expect(page).toContain('data-look="classic"')
    expect(page).toMatch(/<link rel="stylesheet" href="\/theme\/paper.css" data-css="3" data-look-css>/)
    expect(read("Notes/Plain/index.html")).not.toMatch(/<link[^>]*paper.css/)
  })
  test("its stylesheets for every page come before the vault's own", () => {
    const page = read("Notes/Plain/index.html")
    expect(page).toContain('<link rel="stylesheet" href="/theme/ink.css">')
    expect(page).not.toContain("stray.css")
  })
  test("only its stylesheets, fonts and pictures are published, from its own folder", () => {
    expect(read("theme/ink.css")).toContain("Ink Serif")
    expect(read("theme/paper.css")).toContain("--bg")
    expect(read("theme/fonts/ink.woff2")).toBe("wOF2-fixture")
    for (const kept of ["theme/theme.js", "theme/mark.svg", "theme/theme.yaml", "theme/.hidden/a.css", "stray.css"]) {
      expect(fs.existsSync(path.join(out, kept))).toBe(false)
    }
  })
  test("datme.yaml beats the pack; its own font is never fetched; a bad value keeps datme's", () => {
    const page = read("Notes/Plain/index.html")
    expect(page).toContain("--accent:#2d6a4f")
    expect(page).not.toContain("#1f3a93")
    const fonts = page.match(/href="(https:\/\/fonts.googleapis.com\/css2[^"]*)"/)![1]
    expect(fonts).toContain("Fraunces")
    expect(fonts).not.toContain("Ink")
    expect(page).toContain('data-mermaid="neutral dark"')
  })
})

describe("a style per tag", () => {
  test("a note takes the style of its tag, a nested one its parent's", () => {
    expect(read("Notes/Haiku/index.html")).toContain('data-look="garden"')
  })
  test("a note's own style beats its tag, and an untagged note keeps the site's", () => {
    expect(read("Notes/Sonnet/index.html")).toContain('data-look="notebook"')
    expect(read("Notes/Plain/index.html")).toContain('data-look="classic"')
  })
})

describe("the reader's style", () => {
  test("pages offer every site-wide style in the View menu", () => {
    const page = read("Notes/Plain/index.html")
    expect(page).toMatch(/data-look-own="classic"/)
    const looks = JSON.parse(page.match(/data-reader-looks="([^"]*)"/)![1].replaceAll("&quot;", '"')) as Record<string, string[]>
    expect(Object.keys(looks)).toEqual(["classic", "notebook", "garden", "ink"])
    expect(looks.ink).toEqual(["classic", "/theme/paper.css"])
    expect(looks.classic).toEqual(["classic"])
    expect(looks.garden[0]).toBe("garden")
    expect(looks.garden[1]).toMatch(/\.css$/)
    const menu = page.split("data-look-switch")[1].split("</div>")[0]
    expect([...menu.matchAll(/name="reader-look" value="([^"]*)"/g)].map((m) => m[1])).toEqual(["", "notebook", "classic", "garden", "ink"])
    // The script that applies the choice before the first paint, and only the page's own sheet linked.
    expect(page).toContain('localStorage.getItem("look")')
    expect(page.match(/<link[^>]*data-look-css/g)).toBeNull()
  })
  test("only the chosen style's sheet loads: a notebook page links its own", () => {
    expect(read("Notes/Sonnet/index.html").match(/<link[^>]*data-look-css[^>]*>/g)).toHaveLength(1)
  })

  for (const page of ["index.html", "Notes/Plain/index.html", "Notes/Haiku/index.html", "Ink/Letter/index.html"]) {
    test(`${page} has no serious or critical axe violations`, async () => {
      expect(await violations(page)).toEqual([])
    }, 30_000)
  }
})
