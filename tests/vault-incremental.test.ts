import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadConfig, site } from "../src/site.config"
import { newIndexCache, type IndexCache } from "../src/lib/vault"
import { incrementalAndFresh } from "./vault-snapshot"

// A copy of the fixture vault, edited step by step as a writer would while `datme dev` runs.
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "datme-incremental-")))
const dir = path.join(tmp, "vault")
const saved = { ...site }
const lockBefore = process.env.DATME_LOCK_TESTERS
let cache: IndexCache
let version = 9_100_000
let last = ""

/** Points the site at the copy, reading its datme.yaml again, as a new `datme dev` would. */
function useConfig(): void {
  const config = loadConfig(dir, {})
  for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
  Object.assign(site, config)
}

const file = (rel: string) => path.join(dir, rel)
const read = (rel: string) => fs.readFileSync(file(rel), "utf8")
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true })
  fs.writeFileSync(file(rel), text)
}

/** Indexes the vault again with the cache, and afresh: both must be the same index. Returns the cache's counts. */
function same() {
  const { incremental, fresh, vault } = incrementalAndFresh(cache, ++version)
  expect(incremental).toEqual(fresh)
  const before = last
  last = incremental
  return { ...cache.stats, vault, changed: incremental !== before }
}

/** Like `same`, for an edit that must show in the index: a step that changes nothing proves nothing. */
function changed() {
  const after = same()
  expect(after.changed).toBe(true)
  return after
}

beforeAll(() => {
  fs.cpSync(path.resolve(import.meta.dir, "fixtures/vault"), dir, { recursive: true, verbatimSymlinks: true })
  useConfig()
  cache = newIndexCache()
})

afterAll(() => {
  for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
  Object.assign(site, saved)
  if (lockBefore === undefined) delete process.env.DATME_LOCK_TESTERS
  else process.env.DATME_LOCK_TESTERS = lockBefore
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("the vault index kept between builds", () => {
  test("a first build reads every note, and a second one with nothing changed reads none", () => {
    const first = same()
    expect(first.read).toBeGreaterThan(20)
    expect(first.reused).toBe(0)
    const second = same()
    expect(second.read).toBe(0)
    expect(second.built).toBeLessThan(second.reused)
  })

  test("editing a note's text reads that note again and reuses the others", () => {
    write("03_Atomic/Zettelkasten.md", read("03_Atomic/Zettelkasten.md") + "\n\nA new thought, saved.\n")
    const after = changed()
    expect(after.read).toBe(1)
    expect(after.reused).toBeGreaterThan(after.built)
  })

  test("adding the note a link was missing resolves the link", () => {
    const before = same().vault
    const missing = before.problems.find((p) => /^link to missing note "[^"/]+"$/.test(p.message))!
    const name = missing.message.match(/"(.+)"/)![1]
    write(`${name}.md`, "---\npublish: true\ntags: [theme/pkm]\n---\nNow it exists, and links to [[Zettelkasten]].\n")
    const after = changed().vault
    expect(after.problems.some((p) => p.message === missing.message && p.file === missing.file)).toBe(false)
  })

  test("renaming, then deleting a note others link to", () => {
    fs.renameSync(file("06_Reference/Niklas Luhmann.md"), file("06_Reference/Luhmann.md"))
    changed()
    fs.rmSync(file("06_Reference/Luhmann.md"))
    changed()
  })

  test("frontmatter: unpublishing a note, giving one an alias and changing tags", () => {
    const code = read("03_Atomic/Code.md")
    write("03_Atomic/Code.md", code.replace(/^publish: true$/m, "publish: false"))
    changed()
    write("03_Atomic/Code.md", code.replace(/^tags: .*$/m, "aliases: [Niklas Luhmann, Programming]\ntags: [theme/other, type/book]"))
    changed()
    write("03_Atomic/Code.md", code)
    changed()
  })

  test("changing a note's links, its language blocks and its locked parts", () => {
    const text = read("03_Atomic/Zettelkasten.md")
    write(
      "03_Atomic/Zettelkasten.md",
      `${text}\n[[Code]] and [[Nowhere at all]], ![[_assets/missing.png]]\n<!--lang:en-US-->\nOnly in English, see [[Code]].\n<!--lang:*-->\n`,
    )
    changed()
    write("03_Atomic/Zettelkasten.md", `${text}\n<!--lock:@testers-->\nA locked part with [[Code]].\n<!--lock:*-->\n`)
    changed()
  })

  test("editing a drawing, a canvas and a base", () => {
    write("_assets/draw/Sketch.excalidraw.md", read("_assets/draw/Sketch.excalidraw.md").replace("[[wide.png]]", "[[diagram.png]]"))
    changed()
    write("07_Project/Map.canvas", read("07_Project/Map.canvas").replace(/"text": "([^"]*)"/, '"text": "$1 and [[Code]]"'))
    changed()
    write("05_Structure/Library.base", read("05_Structure/Library.base").replace("limit: 2", "limit: 3"))
    changed()
  })

  test("adding and removing a picture a note embeds", () => {
    write("03_Atomic/Pictured.md", "---\npublish: true\nbanner: '[[late.png]]'\n---\n![[late.png]]\n")
    changed()
    write("_assets/late.png", "not really a png")
    changed()
    fs.rmSync(file("_assets/late.png"))
    changed()
  })

  test("a bibliography entry going away, and a group password set or unset", () => {
    const bib = read("_assets/refs.bib")
    write("_assets/refs.bib", bib.replace(/@book\{luhmann1992,[^@]*/, ""))
    changed()
    write("_assets/refs.bib", bib)
    changed()
    delete process.env.DATME_LOCK_TESTERS
    changed()
    process.env.DATME_LOCK_TESTERS = "another-password"
    changed()
  })

  test("a link to a neighbour garden is asked again on each build", () => {
    site.neighbours = { friend: "https://friend.example" }
    write("03_Atomic/Neighbourly.md", "---\npublish: true\n---\nSee [[friend:Roses]] in a friend's garden.\n")
    changed()
    const again = same()
    expect(again.reused).toBeGreaterThan(again.built)
  })

  test("a changed datme.yaml indexes everything again", () => {
    write("datme.yaml", read("datme.yaml").replace(/^languages: .*$/m, "languages: [en-US]\npublish: all\nprivateLinks: hide"))
    useConfig()
    const after = changed()
    expect(after.reused).toBe(0)
    expect(after.read).toBeGreaterThan(20)
  })

  test("a config file changed on disk alone indexes everything again", () => {
    same()
    write("datme.yaml", `${read("datme.yaml")}\n# touched\n`)
    expect(same().reused).toBe(0)
  })

  test("a file of the .datme folder changed indexes everything again", () => {
    write(".datme/themes/mine/theme.yaml", "style: notebook\n")
    expect(same().reused).toBe(0)
    expect(same().reused).toBeGreaterThan(0)
    write(".datme/themes/mine/theme.yaml", "style: classic\n")
    expect(same().reused).toBe(0)
  })

  test("notes dated by git follow new commits", () => {
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" }
    const git = (...args: string[]) => {
      const date = args.includes("--date") ? args[args.indexOf("--date") + 1] : undefined
      const p = Bun.spawnSync(["git", "-C", dir, ...args], { env: date ? { ...env, GIT_COMMITTER_DATE: date } : env })
      if (p.exitCode !== 0) throw new Error(p.stderr.toString())
    }
    git("init", "-q")
    git("add", "-A")
    // A commit changes dates, not files: every note it dates is indexed again, though no file changed.
    git("commit", "-qm", "first", "--date", "2026-01-02T10:00:00Z")
    expect(changed().read).toBe(0)
    write("03_Atomic/Code.md", `${read("03_Atomic/Code.md")}\n`)
    git("add", "-A")
    git("commit", "-qm", "second", "--date", "2026-05-06T10:00:00Z")
    const after = changed()
    expect(after.reused).toBeGreaterThan(after.built)
    expect(after.vault.byKey["en-US"].get("03_Atomic/Code")!.updated!.toISOString()).toBe("2026-05-06T10:00:00.000Z")
  })
})
