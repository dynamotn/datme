import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as childProcess from "node:child_process"
import { diffParagraphs, noteVersions, publicText } from "../src/lib/history"
import { weekOf, wordsChanged } from "../src/lib/changes"
import { getVault } from "../src/lib/vault"

describe("what a version showed", () => {
  test("the public text only: no frontmatter, comments, locked parts or other languages", () => {
    const raw = "---\npublish: true\nsecret: x\n---\nSeen.\n\n%%hidden%%\n<!-- note to self -->\n<!--lock:pw-->\nLocked.\n<!--lock:*-->\n<!--lang:vi-VN-->\nTiếng Việt.\n<!--lang:en-US-->\nEnglish.\n<!--lang:*-->\nEnd."
    expect(publicText(raw, "en-US")).toBe("Seen.\n\nEnglish.\nEnd.")
  })

  test("comment marks inside code and math are text, as on the page", () => {
    const raw =
      "---\npublish: true\n---\nRun `echo %%x%%` and $a %% b$.\n\n```\n%% kept %%\n<!-- kept -->\n```\n\n    %% indented %%\n\n%%gone%%<!-- gone -->\nEnd."
    expect(publicText(raw, "en-US")).toBe(
      "Run `echo %%x%%` and $a %% b$.\n\n```\n%% kept %%\n<!-- kept -->\n```\n\n    %% indented %%\n\nEnd.",
    )
  })

  test("an untranslated version showed its fallback language, as the page did", () => {
    const raw = "---\npublish: true\n---\nSeen.\n<!--lang:vi-VN-->\nTiếng Việt.\n<!--lang:*-->\nEnd."
    expect(publicText(raw, "en-US")).toBe("Seen.\nTiếng Việt.\nEnd.")
    expect(publicText(raw.replace("publish: true", "publish: true\nfallback_lang: none"), "en-US")).toBe("Seen.\nEnd.")
  })

  test("a private or protected version showed nothing", () => {
    expect(publicText("---\npublish: false\n---\nDraft.", "en-US")).toBeUndefined()
    expect(publicText("No frontmatter.", "en-US")).toBeUndefined()
    expect(publicText("---\npublish: true\npassword: pw\n---\nShh.", "en-US")).toBeUndefined()
  })

  test("a version scheduled for later showed nothing until its day", () => {
    const raw = "---\npublish: true\npublish_date: 2026-05-01\n---\nEarly."
    expect(publicText(raw, "en-US", new Date("2026-04-01"))).toBeUndefined()
    expect(publicText(raw, "en-US", new Date("2026-06-01"))).toBe("Early.")
  })
})

describe("reading versions from git", () => {
  test("happens once per build, not once per note or per language", () => {
    const g = globalThis as { __vaultVersion?: number }
    const saved = g.__vaultVersion
    // A vault version of its own, so nothing was read before.
    g.__vaultVersion = 8_000_001
    const vault = getVault()
    const spy = spyOn(childProcess, "execFileSync")
    try {
      const all = (["vi-VN", "en-US"] as const).flatMap((lang) => vault.notes[lang])
      const versions = all.map(noteVersions)
      const calls = (cmd: string) => spy.mock.calls.filter((c) => (c[1] as string[]).includes(cmd)).length
      expect(calls("log")).toBe(1)
      expect(calls("cat-file")).toBe(1)
      expect(calls("show")).toBe(0)
      const queries = all.filter((n) => n.key === "03_Atomic/Queries").map(noteVersions)
      expect(queries).toHaveLength(2)
      expect(queries[0].length).toBeGreaterThan(0)
      expect(versions.length).toBe(all.length)
    } finally {
      spy.mockRestore()
      g.__vaultVersion = (saved ?? 0) + 8_000_002
    }
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

describe("changes", () => {
  test("words changed count additions and removals, so a typo fix is small", () => {
    expect(wordsChanged("Roses need sun.", "Roses need sunlight.")).toBe(2)
    expect(wordsChanged("", "Tulips want a cold winter first.")).toBe(6)
    expect(wordsChanged("a b c", "a b c")).toBe(0)
  })

  test("changes are grouped by the Monday of their week", () => {
    expect(weekOf(new Date("2026-05-12T10:00:00Z"))).toBe("2026-05-11")
    expect(weekOf(new Date("2026-05-17T23:00:00Z"))).toBe("2026-05-11")
    expect(weekOf(new Date("2026-05-11T00:00:00Z"))).toBe("2026-05-11")
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
    commit("Garden.md", "---\npublish: true\ntags: [plants]\n---\nRoses need sun.", "garden", "2026-05-04T10:00:00Z")
    commit("Garden.md", "---\npublish: true\ntags: [plants]\n---\nRoses need sunlight.", "typo", "2026-05-05T10:00:00Z")
    commit("Garden.md", "---\npublish: true\ntags: [plants]\n---\nRoses need sunlight.\n\nTulips want a cold winter first.", "tulips", "2026-05-12T10:00:00Z")
    // A version linking a private note, and notes that once lived where nothing is published.
    fs.mkdirSync(path.join(vault, "Vault Secrets"), { recursive: true })
    commit("Vault Secrets/Hidden Plan.md", "---\npublish: false\n---\nNot for you.", "private", "2025-06-01T10:00:00Z")
    commit("Linked.md", "---\npublish: true\n---\nSee [[Vault Secrets/Hidden Plan|the plan]].", "linked", "2025-06-01T10:00:00Z")
    commit("Linked.md", "---\npublish: true\n---\nSee [[Vault Secrets/Hidden Plan|the plan]].\n\nMore.", "linked 2", "2025-06-02T10:00:00Z")
    const long = "A long paragraph that stays the same, so git still sees the move as a rename of the note.\n\n".repeat(4)
    for (const dir of [".trash", "templates"]) {
      fs.mkdirSync(path.join(vault, dir), { recursive: true })
      fs.writeFileSync(path.join(vault, "datme.yaml"), "history: true\nignore: [templates]\n")
      commit(`${dir}/Moved ${dir}.md`, `---\npublish: true\n---\n${long}Old body from ${dir.toUpperCase()} FOLDER.`, "old", "2025-06-03T10:00:00Z")
      git("mv", `${dir}/Moved ${dir}.md`, `Moved ${dir}.md`)
      commit(`Moved ${dir}.md`, `---\npublish: true\n---\n${long}Now public.`, "moved", "2025-06-04T10:00:00Z")
    }
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
      const leaked = ["secret draft", "private aside", "Locked leaf", "hunter2", "SECRET MESSAGE", "Vault Secrets", "TRASH FOLDER", "TEMPLATES FOLDER"].find((x) =>
        text.includes(x),
      )
      expect(leaked ? `${file}: ${leaked}` : "").toBe("")
    }
  })

  test("/changes lists each public change, newest first, grouped by week; typo fixes are left out", () => {
    const html = fs.readFileSync(path.join(out, "changes/index.html"), "utf8")
    const titles = [...html.matchAll(/<a class="internal" href="([^"]+)">\s*([^<]+?)\s*<\/a>/g)].map((m) => `${m[1]} ${m[2]}`)
    expect(titles.slice(0, 2)).toEqual(["/Garden/history Garden", "/Garden/history Garden"])
    expect(html).toContain("<ins>+1</ins> <del>−0</del>")
    expect(html).toContain('<p class="changes-excerpt">Tulips want a cold winter first.</p>')
    expect(html).toMatch(/Week of May 11, 2026/)
    const lists = [...html.matchAll(/<ol class="archive-list changes-list">[\s\S]*?<\/ol>/g)].map((m) => m[0]).join("")
    expect(lists).toContain("Idea")
    expect(lists).not.toContain("Quiet")
    const feed = fs.readFileSync(path.join(out, "changes.xml"), "utf8")
    // Garden and Idea's four, and the planting of Linked and the two moved notes.
    expect(feed.match(/<item>/g)!.length).toBe(7)
    expect(feed).toContain("<title>Garden (+1 −0 paragraphs)</title>")
    expect(feed).toContain('<guid isPermaLink="false">/Garden@2026-05-12T10:00:00.000Z</guid>')
    expect(fs.existsSync(path.join(out, "tags/plants/changes.xml"))).toBe(true)
  })

  test("a note can opt out", () => {
    expect(fs.existsSync(path.join(out, "Quiet/history/index.html"))).toBe(false)
    expect(fs.readFileSync(path.join(out, "Quiet/index.html"), "utf8")).not.toContain("history-link")
  })
})
