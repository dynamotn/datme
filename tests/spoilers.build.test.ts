import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// End-to-end: a note with a content warning shows its text on its own page, behind the warning, and nowhere else.
const root = path.resolve(import.meta.dir, "..")
const SECRET = "the butler did it"
let tmp = ""
let out = ""

function* files(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else yield p
  }
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-cw-"))
  const vault = path.join(tmp, "vault")
  fs.mkdirSync(vault)
  fs.writeFileSync(path.join(vault, "datme.yaml"), "site:\n  url: https://x.dev\nllms: true\n")
  fs.writeFileSync(
    path.join(vault, "Tale.md"),
    `---\npublish: true\ncw: violence\ndescription: ${SECRET}\ntags: [story]\n---\n# Tale\n\nThe first line: ${SECRET}.\n\nMore.\n`,
  )
  fs.writeFileSync(path.join(vault, "Plain.md"), `---\npublish: true\n---\n# Plain\n\nSee [[Tale]]. A ||twist|| and\n\n> [!spoiler]\n> a hidden ending\n`)
  out = path.join(tmp, "site")
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
}, 180_000)

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe("a note with a content warning", () => {
  const text = (f: string) => fs.readFileSync(f, "utf8")
  const rel = (f: string) => path.relative(out, f)

  test("its text is on its own page behind the warning, and in no excerpt, card, feed, index or other page", () => {
    const holders = [...files(out)]
      .filter((f) => /\.(html|xml|json|txt|md|webmanifest)$/.test(f) && text(f).toLowerCase().includes(SECRET))
      .map(rel)
      .sort()
    // Its page, and its markdown copy: the whole text, as written.
    expect(holders).toEqual(["Tale.md", "Tale/index.html"])
    const page = text(path.join(out, "Tale/index.html"))
    expect(page).toContain('<details class="cw" data-cw="/Tale">')
    expect(page).toMatch(/<meta name="description" content="violence">/)
    expect(page).toMatch(/<meta property="og:description" content="violence">/)
    expect(page).toContain('"description":"violence"')
    expect(page).toContain('<div class="cw-body" data-pagefind-ignore>')
    expect(text(path.join(out, "index.xml"))).toContain("violence")
    expect(text(path.join(out, "llms.txt"))).toContain("[Tale](")
    expect(text(path.join(out, "llms-full.txt"))).toContain("> Content warning: violence")
  })

  test("the page that links to it, and its spoilers, show no hidden text in the index", () => {
    const index = [...files(out)]
      .filter((f) => /contentIndex.*\.json$/.test(f))
      .map(text)
      .join("")
    expect(index).toContain("violence")
    expect(index).not.toContain("twist")
    expect(index).not.toContain("hidden ending")
    expect(text(path.join(out, "Plain/index.html"))).toContain("hidden ending")
  })
})
