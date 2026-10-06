import { describe, expect, test } from "bun:test"
import { getVault } from "../src/lib/vault"
import { relatedNotes, unlinkedMentions } from "../src/lib/related"

const vi = getVault().byKey["vi-VN"]

describe("related notes", () => {
  test("notes sharing a topic tag are related, with the reason", () => {
    const rel = relatedNotes(vi.get("03_Atomic/Zettelkasten")!)
    const code = rel.find((r) => r.note.key === "03_Atomic/Code")!
    expect(code.tags).toEqual(["theme/pkm"])
    expect(code.score).toBeGreaterThanOrEqual(2)
  })

  test("notes already linked to each other are not suggested", () => {
    const rel = relatedNotes(vi.get("03_Atomic/Zettelkasten")!).map((r) => r.note.key)
    expect(rel).not.toContain("06_Reference/Niklas Luhmann")
  })
})

describe("unlinked mentions", () => {
  test("whole-word, case-insensitive mentions of the title are found with context", () => {
    const m = unlinkedMentions(vi.get("06_Reference/Niklas Luhmann")!)
    const fleeting = m.find((x) => x.note.key === "01_Fleeting/01_Fleeting")!
    expect(fleeting.context).toContain("inspired by niklas luhmann")
  })

  test("notes that already link are left out, and protected notes never are a source", () => {
    const keys = unlinkedMentions(vi.get("06_Reference/Niklas Luhmann")!).map((x) => x.note.key)
    expect(keys).not.toContain("03_Atomic/Zettelkasten")
    expect(keys).not.toContain("06_Reference/Secret")
  })
})
