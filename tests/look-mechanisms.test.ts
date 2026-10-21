import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Window } from "happy-dom"

// A site readers can restyle, with a style per tag: built once, then read and checked with axe.
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
    expect(Object.keys(looks)).toEqual(["classic", "notebook", "garden"])
    expect(looks.classic).toEqual(["classic"])
    expect(looks.garden[0]).toBe("garden")
    expect(looks.garden[1]).toMatch(/\.css$/)
    const menu = page.split("data-look-switch")[1].split("</div>")[0]
    expect([...menu.matchAll(/name="reader-look" value="([^"]*)"/g)].map((m) => m[1])).toEqual(["", "notebook", "classic", "garden"])
    // The script that applies the choice before the first paint, and only the page's own sheet linked.
    expect(page).toContain('localStorage.getItem("look")')
    expect(page.match(/<link[^>]*data-look-css/g)).toBeNull()
  })
  test("only the chosen style's sheet loads: a notebook page links its own", () => {
    expect(read("Notes/Sonnet/index.html").match(/<link[^>]*data-look-css[^>]*>/g)).toHaveLength(1)
  })

  for (const page of ["index.html", "Notes/Plain/index.html", "Notes/Haiku/index.html"]) {
    test(`${page} has no serious or critical axe violations`, async () => {
      expect(await violations(page)).toEqual([])
    }, 30_000)
  }
})
