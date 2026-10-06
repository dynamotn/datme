import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Window } from "happy-dom"

// Builds the fixture vault and runs axe on each kind of page. Contrast needs a
// real layout engine, so Lighthouse checks it in CI instead.
const root = path.resolve(import.meta.dir, "..")
let out = ""
const axeSource = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8")

beforeAll(() => {
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-a11y-")), "site")
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", path.join(root, "tests/fixtures/vault"), "--out", out], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
}, 180_000)

afterAll(() => fs.rmSync(path.dirname(out), { recursive: true, force: true }))

interface Violation {
  id: string
  impact: string | null
  help: string
  nodes: { target: string[] }[]
}

/** Serious and critical axe violations of a built page, scripts not run. */
async function violations(page: string): Promise<Violation[]> {
  const window = new Window({ url: "https://notes.dynamotn.dev/", settings: { disableJavaScriptEvaluation: false } })
  // The page's own scripts would fetch and animate; axe only needs the markup.
  window.document.write(fs.readFileSync(path.join(out, page), "utf8").replace(/<script\b[\s\S]*?<\/script>/g, ""))
  window.eval(axeSource)
  const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: Violation[] }> } }).axe
  const res = await axe.run(window.document, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] })
  await window.happyDOM.close()
  return res.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
}

const PAGES = [
  "index.html",
  "03_Atomic/Zettelkasten/index.html",
  "07_Project/Blog-post/index.html",
  "06_Reference/index.html",
  "tags/index.html",
  "tags/type/blog/index.html",
  "archive/index.html",
  "recent/index.html",
  "timeline/index.html",
  "map/index.html",
  "stats/index.html",
  "06_Reference/Secret/index.html",
]

describe("accessibility", () => {
  test("the check catches what it should", async () => {
    // A page with an unlabelled image and button, so a silent axe cannot pass for a clean site.
    fs.writeFileSync(path.join(out, "broken.html"), '<!doctype html><html lang="en"><head><title>x</title></head><body><main><img src="x.png"><button></button></main></body></html>')
    expect((await violations("broken.html")).map((v) => v.id).sort()).toEqual(["button-name", "image-alt"])
  }, 30_000)

  for (const page of PAGES) {
    test(`${page} has no serious or critical axe violations`, async () => {
      const found = await violations(page)
      const report = found.map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
      expect(report).toEqual([])
    }, 30_000)
  }
})
