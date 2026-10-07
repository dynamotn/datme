import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { diffParagraphs, publicText } from "../src/lib/history"

describe("what a version showed", () => {
  test("the public text only: no frontmatter, comments, locked parts or other languages", () => {
    const raw = "---\npublish: true\nsecret: x\n---\nSeen.\n\n%%hidden%%\n<!-- note to self -->\n<!--lock:pw-->\nLocked.\n<!--lock:*-->\n<!--lang:vi-VN-->\nTiếng Việt.\n<!--lang:*-->\nEnd."
    expect(publicText(raw, "en-US")).toBe("Seen.\n\nEnd.")
  })

  test("a private or protected version showed nothing", () => {
    expect(publicText("---\npublish: false\n---\nDraft.", "en-US")).toBeUndefined()
    expect(publicText("No frontmatter.", "en-US")).toBeUndefined()
    expect(publicText("---\npublish: true\npassword: pw\n---\nShh.", "en-US")).toBeUndefined()
  })
})

describe("what changed", () => {
  test("paragraphs kept, added and removed, in order", () => {
    expect(diffParagraphs("A\n\nB\n\nC", "A\n\nB2\n\nC\n\nD")).toEqual([
      { kind: "same", text: "A" },
      { kind: "add", text: "B2" },
      { kind: "del", text: "B" },
      { kind: "same", text: "C" },
      { kind: "add", text: "D" },
    ])
    expect(diffParagraphs("", "Seed.")).toEqual([{ kind: "add", text: "Seed." }])
    // A code block is one block, blank lines and all.
    expect(diffParagraphs("", "Intro\n\n```\na\n\nb\n```\n\nEnd").map((c) => c.text)).toEqual(["Intro", "```\na\n\nb\n```", "End"])
  })
})

describe("history pages", () => {
  const root = path.resolve(import.meta.dir, "..")
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-history-"))
  const vault = path.join(tmp, "vault")
  const out = path.join(tmp, "site")
  const git = (...args: string[]) => {
    const p = Bun.spawnSync(["git", "-C", vault, ...args], {
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" },
    })
    if (p.exitCode !== 0) throw new Error(p.stderr.toString())
  }
  const commit = (file: string, text: string, message: string, date: string) => {
    fs.writeFileSync(path.join(vault, file), text)
    git("add", "-A")
    Bun.spawnSync(["git", "-C", vault, "commit", "-qm", message, "--date", date], {
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x", GIT_COMMITTER_DATE: date },
    })
  }

  beforeAll(() => {
    fs.mkdirSync(vault, { recursive: true })
    git("init", "-q")
    fs.writeFileSync(path.join(vault, "datme.yaml"), "history: true\n")
    commit("Idea.md", "---\npublish: false\n---\nA secret draft.", "SECRET MESSAGE one", "2026-01-01T10:00:00Z")
    commit("Idea.md", "---\npublish: true\n---\nSeed idea.", "plant", "2026-02-01T10:00:00Z")
    commit(
      "Idea.md",
      "---\npublish: true\n---\nSeed idea.\n\nIt grew a branch.\n\n%%private aside%%\n\n<!--lock:hunter2-->\nLocked leaf.\n<!--lock:*-->",
      "SECRET MESSAGE two",
      "2026-03-01T10:00:00Z",
    )
    commit("Idea.md", "---\npublish: true\ntags: [x]\n---\nSeed idea.\n\nIt grew a branch.", "tags only", "2026-04-01T10:00:00Z")
    commit("Quiet.md", "---\npublish: true\nhistory: false\n---\nOne.", "quiet", "2026-02-01T10:00:00Z")
    commit("Quiet.md", "---\npublish: true\nhistory: false\n---\nOne.\n\nTwo.", "quiet 2", "2026-03-01T10:00:00Z")
    const build = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
      stdout: "pipe",
      stderr: "pipe",
    })
    if (build.exitCode !== 0) throw new Error(build.stderr.toString())
  }, 180_000)
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  test("a note that grew shows each public version with what changed, newest first", () => {
    const html = fs.readFileSync(path.join(out, "Idea/history/index.html"), "utf8")
    expect(html.match(/class="history-step"/g)).toHaveLength(2)
    expect(html).toMatch(/<ins class="history-add">It grew a branch\.<\/ins>[\s\S]*<ins class="history-add">Seed idea\.<\/ins>/)
    expect(html).toContain("1 paragraphs unchanged")
    expect(html).toContain('name="robots" content="noindex')
    expect(fs.readFileSync(path.join(out, "Idea/index.html"), "utf8")).toContain('href="/Idea/history">🌱 2 versions')
  })

  test("nothing a reader could not see then: private versions, comments, locks, messages", () => {
    for (const file of fs.readdirSync(out, { recursive: true }) as string[]) {
      const p = path.join(out, file)
      if (!fs.statSync(p).isFile() || !/\.(html|json|xml|md|txt)$/.test(file)) continue
      const text = fs.readFileSync(p, "utf8")
      const leaked = ["secret draft", "private aside", "Locked leaf", "hunter2", "SECRET MESSAGE"].find((x) => text.includes(x))
      expect(leaked ? `${file}: ${leaked}` : "").toBe("")
    }
  })

  test("a note can opt out", () => {
    expect(fs.existsSync(path.join(out, "Quiet/history/index.html"))).toBe(false)
    expect(fs.readFileSync(path.join(out, "Quiet/index.html"), "utf8")).not.toContain("history-link")
  })
})
