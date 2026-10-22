import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { site } from "../src/site.config"
import { getVault, type Note } from "../src/lib/vault"
import { gardenChanges, hasChanges, noteChanges, TRIVIAL_WORDS, wordsChanged } from "../src/lib/changes"
import { hasHistory, historyUrl, noteVersions } from "../src/lib/history"
import { digestOf } from "../src/lib/collection-views"

// A small vault of its own, in git, so the history is known exactly.
const tmpRoot = os.tmpdir()
fs.mkdirSync(tmpRoot, { recursive: true })
const tmp = fs.mkdtempSync(path.join(tmpRoot, "changes-"))
const vault = path.join(tmp, "vault")
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" }
const git = (...args: string[]) => {
  const p = Bun.spawnSync(["git", "-C", vault, ...args], { env })
  if (p.exitCode !== 0) throw new Error(p.stderr.toString())
}
const commit = (date: string, files: Record<string, string | null>) => {
  for (const [file, text] of Object.entries(files)) {
    const p = path.join(vault, file)
    if (text == null) fs.rmSync(p)
    else {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, text)
    }
  }
  git("add", "-A")
  const p = Bun.spawnSync(["git", "-C", vault, "commit", "-qm", "m", "--date", date], { env: { ...env, GIT_COMMITTER_DATE: date } })
  if (p.exitCode !== 0) throw new Error(p.stderr.toString())
}
const fm = (extra = "") => `---\npublish: true\n${extra}---\n`
const long = "word ".repeat(60).trim()

const g = globalThis as { __vaultVersion?: number }
const saved = { vault: site.vault, history: site.history, version: g.__vaultVersion }
const note = (key: string): Note => getVault().byKey["vi-VN"].get(key)!

beforeAll(() => {
  fs.mkdirSync(vault, { recursive: true })
  git("init", "-q")
  commit("2026-05-04T10:00:00Z", {
    "Garden.md": fm("tags: [plants]\n") + "Roses need sun.",
    "Beds/Bed.md": fm() + "A raised bed.",
    "Once.md": fm() + "Only ever one version.",
    "Phoenix.md": fm() + "First life.",
  })
  // A typo fix: not worth announcing.
  commit("2026-05-05T10:00:00Z", { "Garden.md": fm("tags: [plants]\n") + "Roses need sunlight.", "Phoenix.md": null })
  commit("2026-05-12T10:00:00Z", {
    "Garden.md": fm("tags: [plants]\n") + "Roses need sunlight.\n\nTulips want a cold winter first.",
    "Beds/Bed.md": fm() + "A raised bed.\n\n## [[Compost|Rich soil]] and ![[photo.png]] and [a link](https://x.y) `code` here\n\n```\nfenced\n```",
    "Phoenix.md": fm() + "Second life, risen again.",
  })
  commit("2026-05-20T10:00:00Z", { "Beds/Bed.md": fm() + "A raised bed.\n\n" + long })
  site.vault = vault
  site.history = true
  g.__vaultVersion = 9_000_001
}, 60_000)

afterAll(() => {
  site.vault = saved.vault
  site.history = saved.history
  g.__vaultVersion = (saved.version ?? 0) + 9_000_002
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("one note's changes", () => {
  test("the planted version and each real change, typo fixes left out", () => {
    const changes = noteChanges(note("Garden"))
    expect(changes.map((c) => [c.date.toISOString(), c.planted, c.added, c.removed])).toEqual([
      ["2026-05-04T10:00:00.000Z", true, 1, 0],
      ["2026-05-12T10:00:00.000Z", false, 1, 0],
    ])
    expect(changes[1].excerpt).toBe("Tulips want a cold winter first.")
    expect(changes[0].url).toBe(historyUrl(note("Garden")))
    expect(historyUrl(note("Garden"))).toMatch(/\/Garden\/history$/)
  })

  test("the excerpt is plain text: no markdown, links shown by their label, long text cut", () => {
    const [, linked, longer] = noteChanges(note("Beds/Bed"))
    expect(linked.excerpt).toBe("Rich soil and photo.png and a link code here")
    expect(linked.added).toBe(2)
    expect(longer.removed).toBe(2)
    expect(longer.excerpt.length).toBe(160)
    expect(longer.excerpt.endsWith("…")).toBe(true)
  })

  test("a note with a single version links to the note itself", () => {
    const n = note("Once")
    const [only] = noteChanges(n)
    expect(only.url).toBe(n.url)
    expect(only.excerpt).toBe("Only ever one version.")
    expect(hasHistory(n)).toBe(false)
  })

  test("a version that git cannot show is skipped, the others kept", () => {
    // The deletion commit is in the log, yet has no text to show.
    const versions = noteVersions(note("Phoenix"))
    expect(versions.map((v) => v.text)).toEqual(["First life.", "Second life, risen again."])
    expect(hasHistory(note("Phoenix"))).toBe(true)
  })

  test("untracked notes show no changes", () => {
    const n = note("Garden")
    for (const fake of [
      { ...n, isHome: true },
      { ...n, protected: true },
      { ...n, draft: true },
      { ...n, source: { ...n.source, fm: { ...n.source.fm, history: false } } },
    ] as Note[]) {
      expect(noteChanges(fake)).toEqual([])
      if (!fake.isHome) expect(hasHistory(fake)).toBe(false)
    }
    site.history = false
    try {
      expect(noteChanges(n)).toEqual([])
      expect(hasHistory(n)).toBe(false)
      expect(hasChanges("vi-VN")).toBe(false)
    } finally {
      site.history = true
    }
  })
})

describe("a digest from history", () => {
  test("with `history: true`, every public version counts, linked to the history page", () => {
    const digest = { ...note("Garden"), source: { ...note("Garden").source, fm: { history: true } } }
    const weeks = digestOf(digest, [note("Garden"), note("Beds/Bed")])
    expect(weeks.map((w) => [w.id, w.planted.map((e) => e.note.key).sort(), w.tended.map((e) => e.note.key).sort()])).toEqual([
      ["2026-W21", [], ["Beds/Bed"]],
      ["2026-W20", [], ["Beds/Bed", "Garden"]],
      ["2026-W19", ["Beds/Bed", "Garden"], []],
    ])
    expect(weeks[1].tended.find((e) => e.note.key === "Garden")!.url).toBe(historyUrl(note("Garden")))
  })
})

describe("the garden's changes", () => {
  test("newest first, across the site, limited", () => {
    const all = gardenChanges("vi-VN")
    const times = all.map((c) => c.date.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(all[0].note.key).toBe("Beds/Bed")
    expect(gardenChanges("vi-VN", { kind: "site" }, 2)).toHaveLength(2)
    expect(hasChanges("vi-VN")).toBe(true)
  })

  test("by folder and by tag", () => {
    expect(new Set(gardenChanges("vi-VN", { kind: "folder", dir: "Beds" }).map((c) => c.note.key))).toEqual(new Set(["Beds/Bed"]))
    expect(gardenChanges("vi-VN", { kind: "folder", dir: "Bed" })).toEqual([])
    expect(new Set(gardenChanges("vi-VN", { kind: "tag", tag: "plants" }).map((c) => c.note.key))).toEqual(new Set(["Garden"]))
    expect(gardenChanges("vi-VN", { kind: "tag", tag: "plant" })).toEqual([])
  })
})

describe("counting words", () => {
  test("very long rewrites skip the exact count and are never trivial", () => {
    const a = "a ".repeat(1001)
    const b = "b ".repeat(1001)
    expect(wordsChanged(a, b)).toBe(TRIVIAL_WORDS)
    expect(wordsChanged(a, b + "c")).toBe(1 + TRIVIAL_WORDS)
  })
})
