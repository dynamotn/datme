import { afterAll, describe, expect, test } from "bun:test"
import { getVault } from "../src/lib/vault"
import { computeRelated, relatedNotes, unlinkedMentions } from "../src/lib/related"
import { setEmbedder } from "../src/lib/embeddings"
import { site } from "../src/site.config"

const vi = getVault().byKey["vi-VN"]

describe("related notes", () => {
  test("notes sharing a topic tag are related, with the reason", async () => {
    const rel = await relatedNotes(vi.get("03_Atomic/Zettelkasten")!)
    const code = rel.find((r) => r.note.key === "03_Atomic/Code")!
    expect(code.tags).toEqual(["theme/pkm"])
    expect(code.score).toBeGreaterThanOrEqual(2)
    expect(code.similarity).toBeUndefined()
  })

  test("notes already linked to each other are not suggested", async () => {
    const rel = (await relatedNotes(vi.get("03_Atomic/Zettelkasten")!)).map((r) => r.note.key)
    expect(rel).not.toContain("06_Reference/Niklas Luhmann")
  })
})

describe("notes close in meaning", () => {
  const before = site.related.semantic
  afterAll(() => {
    site.related.semantic = before
    setEmbedder(undefined)
  })

  test("are suggested from their embeddings, above the threshold, never from protected notes", async () => {
    site.related.semantic = { model: "fake", threshold: 0.6 }
    const seen: string[] = []
    // Rain and gardening are close; everything else points elsewhere.
    setEmbedder(async (texts) =>
      texts.map((t) => {
        seen.push(t)
        return /garden/i.test(t) && !/Rain/.test(t) ? [1, 0] : /Rain/.test(t) ? [0.8, 0.6] : [0, 1]
      }),
    )
    const { related } = await computeRelated("vi-VN")
    const poem = related.get("07_Project/Poem")!
    const day = poem.find((r) => r.note.key === "08_Journal/2026-10-05")!
    expect(day.similarity).toBeCloseTo(0.8)
    expect(day.score).toBeCloseTo(2 + (4 * 0.2) / 0.4)
    expect(day.tags).toEqual([])
    // Below the threshold, closeness alone does not make a suggestion.
    expect(poem.some((r) => r.note.key === "03_Atomic/Queries")).toBe(false)
    expect(seen.some((t) => t.includes("Protected content"))).toBe(false)
  })
})

describe("unlinked mentions", () => {
  test("whole-word, case-insensitive mentions of the title are found with context", async () => {
    const m = await unlinkedMentions(vi.get("06_Reference/Niklas Luhmann")!)
    const fleeting = m.find((x) => x.note.key === "01_Fleeting/01_Fleeting")!
    expect(fleeting.context).toContain("inspired by niklas luhmann")
  })

  test("notes that already link are left out, and protected notes never are a source", async () => {
    const keys = (await unlinkedMentions(vi.get("06_Reference/Niklas Luhmann")!)).map((x) => x.note.key)
    expect(keys).not.toContain("03_Atomic/Zettelkasten")
    expect(keys).not.toContain("06_Reference/Secret")
  })
})
