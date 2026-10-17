import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { load as loadYaml } from "js-yaml"
import { applyMigration, describePlan, migrateNote, planMigration } from "../src/lib/migrate"
import { parseArgs, run } from "../src/cli"
import { resolveConfig } from "../src/site.config"

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-migrate-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

/** A vault made of files, by vault-relative path. */
function vault(name: string, files: Record<string, string>): string {
  const dir = path.join(tmp, name)
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), text)
  }
  return dir
}
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), "utf8")

describe("frontmatter", () => {
  test("keys are renamed in place; the rest of the note stays exactly as it was", () => {
    const text = "---\ntitle: Dune\ndg-publish: true # share it\ndg-permalink: books/dune\ntags:\n  - book\n---\nBody with dg-publish: false in it.\n"
    const { text: next, changes } = migrateNote(text, "digital-garden")
    expect(next).toBe("---\ntitle: Dune\npublish: true # share it\npermalink: books/dune\ntags:\n  - book\n---\nBody with dg-publish: false in it.\n")
    expect(changes).toEqual(["dg-publish → publish", "dg-permalink → permalink"])
  })

  test("a key datme already has wins: the old one stays, untouched", () => {
    const { text, changes } = migrateNote("---\npublish: false\ndg-publish: true\n---\n", "digital-garden")
    expect(text).toBe("---\npublish: false\ndg-publish: true\n---\n")
    expect(changes).toEqual([])
  })

  test("notes without frontmatter, and Windows line endings, are safe", () => {
    expect(migrateNote("Just text.", "digital-garden").changes).toEqual([])
    expect(migrateNote("---\r\ndg-publish: true\r\n---\r\nBody", "digital-garden").text).toBe("---\r\npublish: true\r\n---\r\nBody")
  })
})

describe("Digital Garden", () => {
  const dir = vault("dg", {
    "Home.md": "---\ndg-publish: true\ndg-home: true\n---\nWelcome.",
    "Books/Dune.md": "---\ndg-publish: true\ndg-hide: true\ndg-note-icon: 2\n---\nSpice.",
    "Plain.md": "No frontmatter.",
  })

  test("a dry run lists the changes and writes nothing", () => {
    const plan = planMigration(dir, "digital-garden")
    expect(plan.notes.map((n) => n.file)).toEqual(["Books/Dune.md", "Home.md"])
    expect(plan.config).toEqual({ home: "Home.md" })
    const text = describePlan(dir, plan, false)
    expect(text).toContain("Books/Dune.md: dg-publish → publish, dg-hide → unlisted")
    expect(text).toContain("Home.md: dg-publish → publish, dg-home → datme.yaml")
    expect(text).toContain("  + home: Home.md")
    expect(text).toContain("Left as they are, datme does not use them: dg-note-icon.")
    expect(text).toContain('run again with "--write"')
    expect(read(dir, "Home.md")).toContain("dg-publish")
    expect(fs.existsSync(path.join(dir, "datme.yaml"))).toBe(false)
  })

  test("--write applies them, and the result is a valid datme vault", async () => {
    const logs: string[] = []
    const log = console.log
    console.log = (s: string) => logs.push(s)
    try {
      await run(parseArgs(["migrate", "digital-garden", dir, "--write"]))
    } finally {
      console.log = log
    }
    expect(logs.join("\n")).toContain("Done.")
    expect(read(dir, "Home.md")).toBe("---\npublish: true\n---\nWelcome.")
    expect(read(dir, "Books/Dune.md")).toBe("---\npublish: true\nunlisted: true\ndg-note-icon: 2\n---\nSpice.")
    const config = loadYaml(read(dir, "datme.yaml"))
    expect(config).toEqual({ home: "Home.md" })
    expect(resolveConfig(config, dir).home).toBe("Home.md")
  })
})

describe("Obsidian Publish", () => {
  test("cover images become banners and publish.css the theme; an existing datme.yaml keeps its keys", () => {
    const dir = vault("publish", {
      "Note.md": "---\npublish: true\ncover: img/c.png\n---\nText.",
      "publish.css": "body { color: red }",
      "datme.yaml": "# my settings\ntheme:\n  accent: '#123456'\nlanguages: [en-US]\n",
    })
    const plan = planMigration(dir, "publish")
    expect(plan.notes[0].changes).toEqual(["cover → banner"])
    expect(plan.config).toEqual({ theme: { css: "publish.css" } })
    expect(describePlan(dir, plan, false)).toContain('Already set in datme.yaml, left as they are (change them by hand if needed):\n  theme: {"css":"publish.css"}')
    applyMigration(dir, plan)
    expect(read(dir, "datme.yaml")).toBe("# my settings\ntheme:\n  accent: '#123456'\nlanguages: [en-US]\n")
    expect(read(dir, "Note.md")).toBe("---\npublish: true\nbanner: img/c.png\n---\nText.")
  })
})

describe("Quartz", () => {
  test("quartz.config.ts above the content folder gives the title, URL, language and ignored folders", () => {
    const root = vault("quartz", {
      "quartz.config.ts": `const config = { configuration: { pageTitle: "🪴 Quartz Garden", baseUrl: "garden.example.com", locale: "fr-FR", ignorePatterns: ["private", "templates", "drafts", "**/*.excalidraw"] }, plugins: { filters: [Plugin.RemoveDrafts()] } }`,
      "content/index.md": "---\ntitle: Home\n---\nHi.",
    })
    const dir = path.join(root, "content")
    const plan = planMigration(dir, "quartz")
    expect(plan.notes).toEqual([])
    expect(plan.config).toEqual({
      site: { title: "🪴 Quartz Garden", url: "https://garden.example.com" },
      languages: ["fr-FR"],
      ignore: ["drafts"],
      publish: "all",
    })
    expect(plan.notices.join("\n")).toContain("**/*.excalidraw are globs")
    applyMigration(dir, plan)
    const c = resolveConfig(loadYaml(read(dir, "datme.yaml")), dir)
    expect(c.url).toBe("https://garden.example.com")
    expect(c.publish).toBe("all")
  })

  test("with ExplicitPublish, only notes marked publish: true go out, as in datme by default", () => {
    const root = vault("quartz-explicit", {
      "quartz.config.ts": `plugins: { filters: [Plugin.ExplicitPublish()] }`,
      "content/a.md": "a",
    })
    expect(planMigration(path.join(root, "content"), "quartz").config.publish).toBeUndefined()
  })
})

describe("command line", () => {
  test("migrate needs a known publisher", () => {
    expect(parseArgs(["migrate", "quartz", "~/v"])).toMatchObject({ command: "migrate", from: "quartz", write: false })
    expect(() => parseArgs(["migrate", "jekyll"])).toThrow('Unknown publisher "jekyll"')
    expect(() => parseArgs(["migrate"])).toThrow("Missing publisher")
  })
})
