import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { applyMigration, configAddition, describePlan, migrateNote, planMigration, quartzSettings } from "../src/lib/migrate"

const base = os.tmpdir()
fs.mkdirSync(base, { recursive: true })
const tmp = fs.mkdtempSync(path.join(base, "migrate-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

function vault(name: string, files: Record<string, string>): string {
  const dir = path.join(tmp, name)
  fs.mkdirSync(dir, { recursive: true })
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), text)
  }
  return dir
}

describe("migrateNote", () => {
  test("a value YAML cannot read reaches onKey as its text, and a removed key takes its continuation lines", () => {
    const seen: [string, unknown][] = []
    const { text, changes } = migrateNote("---\n# a comment\nodd: [unclosed\nlist:\n  - a\n  - b\nkeep: 1\n---\nBody", "quartz", (key, value) => {
      seen.push([key, value])
      return key === "odd" || key === "list"
    })
    expect(seen).toEqual([
      ["odd", "[unclosed"],
      ["list", null],
      ["keep", 1],
    ])
    expect(text).toBe("---\n# a comment\nkeep: 1\n---\nBody")
    expect(changes).toEqual(["odd → datme.yaml", "list → datme.yaml"])
  })

  test("frontmatter that never closes is left alone", () => {
    expect(migrateNote("---\ndg-publish: true\nno end", "digital-garden")).toEqual({ text: "---\ndg-publish: true\nno end", changes: [] })
  })
})

describe("Digital Garden plan", () => {
  test("dg-home names the home note, unused dg- keys are listed once, and skipped folders are not read", () => {
    const dir = vault("dg", {
      "Home.md": "---\ndg-home: true\ndg-publish: true\ndg-show-toc: true\n---\nHome",
      "Other.md": "---\ndg-home: false\ndg-show-toc: false\ndg-pinned: true\n---\nOther",
      "Plain.md": "No frontmatter",
      "image.png": "not a note",
      ".obsidian/workspace.md": "---\ndg-publish: true\n---\n",
    })
    const plan = planMigration(dir, "digital-garden")
    expect(plan.config).toEqual({ home: "Home.md" })
    expect(plan.notes.map((n) => [n.file, n.changes])).toEqual([
      ["Home.md", ["dg-home → datme.yaml", "dg-publish → publish"]],
      ["Other.md", ["dg-home → datme.yaml"]],
    ])
    expect(plan.notices).toEqual(["Left as they are, datme does not use them: dg-pinned, dg-show-toc."])
  })
})

describe("Quartz without a config", () => {
  test("publishes every note and asks for the title and URL", () => {
    const dir = vault("quartz-bare", { "a.md": "a" })
    const q = quartzSettings(dir)
    expect(q.config).toEqual({ publish: "all" })
    expect(q.notices[0]).toContain("No quartz.config.ts found")
    const plan = planMigration(dir, "quartz")
    expect(plan.config).toEqual({ publish: "all" })
    expect(plan.notices).toEqual(q.notices)
  })

  test("a config naming only an https URL keeps it as it is, without title or language", () => {
    const dir = vault("quartz-url", { "quartz.config.ts": `baseUrl: 'https://g.example', ignorePatterns: [".obsidian"]`, "a.md": "a" })
    expect(quartzSettings(dir)).toEqual({ config: { site: { url: "https://g.example" }, publish: "all" }, notices: [] })
    const empty = vault("quartz-empty", { "quartz.config.ts": "export default {}" })
    expect(quartzSettings(empty).config).toEqual({ publish: "all" })
  })
})

describe("datme.yaml", () => {
  test("a datme.yaml holding null takes every setting; a plan without settings writes none", () => {
    const dir = vault("null-config", { "datme.yaml": "~\n" })
    expect(configAddition(dir, { publish: "all" })).toEqual({ add: { publish: "all" }, skipped: [] })
    applyMigration(dir, { notes: [], config: {}, notices: [] })
    expect(fs.readFileSync(path.join(dir, "datme.yaml"), "utf8")).toBe("~\n")
    applyMigration(dir, { notes: [], config: { publish: "all" }, notices: [] })
    expect(fs.readFileSync(path.join(dir, "datme.yaml"), "utf8")).toBe("~\n\n# Added by datme migrate\npublish: all\n")
  })

  test("an empty or comment-only datme.yaml takes every setting", () => {
    for (const [name, text] of [["empty-config", ""], ["comment-config", "# settings later\n"]]) {
      const dir = vault(name, { "datme.yaml": text })
      expect(configAddition(dir, { publish: "all" })).toEqual({ add: { publish: "all" }, skipped: [] })
    }
  })

  test("a vault without datme.yaml gets a new one, and the report names it", () => {
    const dir = vault("no-config", { "a.md": "a" })
    const plan = { notes: [], config: { publish: "all" }, notices: ["Check it."] }
    expect(describePlan(dir, plan, false)).toBe(
      ["No note needs changing.", "datme.yaml:", "  + publish: all", "Note: Check it.", 'Nothing was written: run again with "--write" to apply.'].join("\n"),
    )
    applyMigration(dir, plan)
    expect(fs.readFileSync(path.join(dir, "datme.yaml"), "utf8")).toBe("# Added by datme migrate\npublish: all\n")
    expect(describePlan(dir, plan, true)).toBe(
      ["No note needs changing.", "Already set in datme.yaml, left as they are (change them by hand if needed):", '  publish: "all"', "Note: Check it.", "Done."].join("\n"),
    )
  })
})
