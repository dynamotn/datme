import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Window } from "happy-dom"
import { STYLES } from "../src/site.config"
import { LAYOUTS } from "../src/lib/vault"
import { buildMatrix, MATRIX_PAGES, OWN_STYLE, pageFile } from "./look-matrix-site"

// Every layout and collection in every style, set site-wide: the fixture of tests/fixtures/layouts built once
// per style. This checks the markup; `bun run matrix` (tools/matrix.ts) opens the same pages in Chromium for
// what needs a layout engine: sideways scrolling, content a style hides, and contrast.
const root = path.resolve(import.meta.dir, "..")
let dir = ""
const read = (style: string, page: string) => fs.readFileSync(path.join(dir, style, pageFile(page)), "utf8")

beforeAll(async () => {
  dir = await buildMatrix()
}, 240_000)

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

const axeSource = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8")
type Result = { violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }
/** Axe findings by page markup: most styles only colour a page, so many pages of the matrix share their markup. */
const audited = new Map<string, string[]>()

/** The page without what a style changes but axe does not read (with color-contrast off): the look, its sheet and colours. */
const markup = (html: string) =>
  html
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/ data-(look|scheme-default)="[^"]*"|<link rel="stylesheet"[^>]*>|<meta name="theme-color"[^>]*>/g, "")

/** As tests/a11y.test.ts: serious and critical axe violations of the markup, scripts not run. */
async function violations(html: string): Promise<string[]> {
  const key = String(Bun.hash(markup(html)))
  const known = audited.get(key)
  if (known) return known
  const window = new Window({ url: "https://example.com/", settings: { disableJavaScriptEvaluation: false } })
  window.document.write(markup(html))
  window.eval(axeSource)
  const axe = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<Result> } }).axe
  const res = await axe.run(window.document, { rules: { "color-contrast": { enabled: false } }, resultTypes: ["violations"] })
  await window.happyDOM.close()
  const found = res.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} at ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
  audited.set(key, found)
  return found
}

/** The classes a page's markup uses. */
const classesOf = (html: string) => new Set([...html.matchAll(/ class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)))

describe("style × layout matrix", () => {
  test("covers every layout and collection", () => {
    const layouts = new Set(MATRIX_PAGES.map((p) => p.layout))
    for (const layout of LAYOUTS) expect(layouts).toContain(layout)
  })

  for (const style of STYLES) {
    test(`${style}: every page keeps its layout's content, in the style, with no serious axe violations`, async () => {
      const problems: string[] = []
      for (const { page, layout, keep } of MATRIX_PAGES) {
        const html = read(style, page)
        const look = html.match(/<html[^>]* data-look="([^"]+)"/)?.[1]
        if (look !== (OWN_STYLE[layout] ?? style)) problems.push(`${page}: data-look ${look}`)
        const classes = classesOf(html)
        for (const sel of keep) if (sel.startsWith(".") ? !classes.has(sel.slice(1)) : !html.includes(`<${sel}`)) problems.push(`${page}: no ${sel}`)
        for (const v of await violations(html)) problems.push(`${page}: ${v}`)
      }
      expect(problems).toEqual([])
    }, 60_000)
  }
})
