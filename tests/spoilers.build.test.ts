import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// End-to-end: a note with a content warning shows its text on its own page, behind the warning, and nowhere else.
const root = path.resolve(import.meta.dir, "..")
const SECRET = "the butler did it"
const QUOTE = "quoted from behind the gate"
const CELLAR = "dusty cellar"
const BLOCK = "buried block"
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
    `---\npublish: true\ncw: violence\ndescription: ${SECRET}\ntags: [story, flashcards]\n---\n# Tale\n\nThe first line: ${SECRET}.\n\n> ${QUOTE}\n>\n> — Someone\n\n## Cellar\n\nIn the ${CELLAR}.\n\nA block ${BLOCK}. ^blk\n\nQ1::A1\n`,
  )
  fs.writeFileSync(path.join(vault, "Plain.md"), `---\npublish: true\n---\n# Plain\n\nSee [[Tale]]. A ||twist|| and\n\n> [!spoiler]\n> a hidden ending\n`)
  fs.writeFileSync(path.join(vault, "Quotes.md"), "---\npublish: true\nlayout: quotebook\n---\n# Quotes\n")
  fs.writeFileSync(path.join(vault, "Embed.md"), "---\npublish: true\n---\n# Embed\n\n![[Tale#Cellar]]\n\n![[Tale#^blk]]\n")
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
    expect(holders.filter((f) => !f.startsWith("Embed/"))).toEqual(["Tale.md", "Tale/index.html"])
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

  test("no quotebook, deck dump or embed shows it outside the notice", () => {
    const all = [...files(out)].filter((f) => /\.(html|json|xml|txt)$/.test(f))
    // Quotes and cards.json: the text is nowhere but on the page itself.
    for (const f of all.filter((x) => !rel(x).startsWith("Tale/") && !rel(x).startsWith("Embed/"))) {
      expect([rel(f), text(f).includes(QUOTE)]).toEqual([rel(f), false])
    }
    // An embedded section or block comes behind the same notice.
    const embed = text(path.join(out, "Embed/index.html"))
    expect(embed.match(/<details class="cw"/g)).toHaveLength(2)
    for (const part of [CELLAR, BLOCK]) {
      const at = embed.indexOf(part)
      expect(at).toBeGreaterThan(embed.indexOf('<details class="cw"'))
      expect(embed.slice(0, at)).toMatch(/<div class="cw-body"[^>]*>(?![\s\S]*<\/details>)/)
    }
  })
})
