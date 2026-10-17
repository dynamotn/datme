import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { site } from "../src/site.config"
import { getVault } from "../src/lib/vault"
import { findMentions, formatSuggestions, suggestionsFor, type Suggestions } from "../src/lib/suggest"

describe("formatSuggestions", () => {
  test("each related note says why: tags, shared links and closeness; empty lists say none", () => {
    const s: Suggestions = {
      file: "Draft.md",
      published: false,
      related: [
        { file: "A.md", title: "A", url: "/a", score: 4, tags: ["pkm", "books"], links: 1 },
        { file: "B.md", title: "B", url: "/b", score: 3, tags: [], links: 2, similarity: 0.834 },
        { file: "C.md", title: "C", url: "/c", score: 2, tags: [], links: 0 },
      ],
      mentions: [],
    }
    expect(formatSuggestions(s)).toBe(
      ["Related to Draft.md (private)", "  A.md  #pkm #books, 1 shared link", "  B.md  2 shared links, ≈ 83%", "  C.md  ", "", "Named without a link", "  none"].join("\n"),
    )
    expect(formatSuggestions({ file: "P.md", published: true, related: [], mentions: [{ file: "X.md", title: "X", text: "x", offset: 0, line: 1 }] })).toBe(
      ["Related to P.md", "  none", "", "Named without a link", '  line 1: "x" → [[X]]'].join("\n"),
    )
  })
})

describe("findMentions", () => {
  test("the longest name is matched first, mentions come in text order, and repeated names count once", () => {
    const src = "About the slip box method.\nThen Zettelkasten again."
    const found = findMentions(src, [
      { file: "Z.md", title: "Zettelkasten", names: ["Zettelkasten", "Zettelkasten "] },
      { file: "S.md", title: "Slip", names: ["slip", "slip box"] },
      { file: "N.md", title: "No", names: ["nowhere to be found"] },
    ])
    expect(found).toEqual([
      { file: "S.md", title: "Slip", text: "slip box", offset: 10, line: 1 },
      { file: "Z.md", title: "Zettelkasten", text: "Zettelkasten", offset: 32, line: 2 },
    ])
  })
})

describe("suggestionsFor a private draft", () => {
  const base = os.tmpdir()
  let dir = ""
  const vaultBefore = site.vault
  beforeAll(() => {
    fs.mkdirSync(base, { recursive: true })
    dir = fs.mkdtempSync(path.join(base, "suggest-"))
    // The index is built from the fixture vault first: only the draft is then read from site.vault.
    getVault()
    fs.mkdirSync(path.join(dir, "03_Atomic"), { recursive: true })
    site.vault = dir
  })
  afterAll(() => {
    site.vault = vaultBefore
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const draft = (name: string, text: string) => fs.writeFileSync(path.join(dir, name), text)

  test("tags written as a comma list, and links (one not valid URI encoding), make the related notes", async () => {
    draft("03_Atomic/Draft.md", "---\ntags: \"#theme/pkm, type/notion\"\n---\nSee [[Zettelkasten]] and [[%E0%A4%A]] and [x](../06_Reference/Niklas%20Luhmann.md).\n")
    const s = await suggestionsFor("/03_Atomic\\Draft.md", "vi-VN")
    expect(s.file).toBe("03_Atomic/Draft.md")
    expect(s.published).toBe(false)
    expect(s.related.length).toBeGreaterThan(0)
    expect(s.related.length).toBeLessThanOrEqual(site.related.count || 5)
    // Shared tags count 2 each, type tags 0.5 and are not shown as a reason.
    const code = s.related.find((r) => r.file === "03_Atomic/Code.md")!
    expect(code.tags).toEqual(["theme/pkm"])
    expect(s.related.every((r) => r.score >= 2 && !r.tags.some((t) => t.startsWith(site.conventions.typePrefix)))).toBe(true)
    // Sorted by score, best first.
    expect(s.related.map((r) => r.score)).toEqual([...s.related.map((r) => r.score)].sort((a, b) => b - a))
    // Notes the draft links to are neither related nor mentioned.
    expect(s.related.some((r) => r.file === "03_Atomic/Zettelkasten.md" || r.file === "06_Reference/Niklas Luhmann.md")).toBe(false)
  })

  test("a draft at the vault root with a tag list, or with no tags at all, still gets an answer", async () => {
    draft("Root.md", "---\ntag: [theme/pkm]\n---\nNothing linked.\n")
    const listed = await suggestionsFor("Root.md", "vi-VN")
    expect(listed.related.some((r) => r.file === "03_Atomic/Code.md")).toBe(true)
    draft("Bare.md", "---\ntags: 3\n---\nNo tags that count.\n")
    const bare = await suggestionsFor("Bare.md", "vi-VN")
    expect(bare.related.every((r) => r.links >= 2)).toBe(true)
  })
})
