import { describe, expect, test } from "bun:test"
import { editionDate, frontPage, SECTION_STORIES } from "../src/lib/broadsheet"
import type { Note } from "../src/lib/vault"

const note = (key: string, dir: string, created?: string) => ({ key, dir, created: created ? new Date(created) : undefined }) as Note
const keys = (notes: Note[]) => notes.map((n) => n.key)

describe("the front page", () => {
  test("the newest note leads, the others follow by top folder, newest first", () => {
    const front = frontPage([
      note("old", "A", "2026-01-01"),
      note("lead", "B/Deep", "2026-03-01"),
      note("b", "B", "2026-02-01"),
      note("a", "A/Sub", "2026-02-15"),
      note("root", "", "2026-01-15"),
      note("undated", "C"),
    ])
    expect(front.lead?.key).toBe("lead")
    // Sections come in the order of their newest note; undated notes come last.
    expect(front.sections.map((s) => [s.dir, keys(s.notes)])).toEqual([
      ["A", ["a", "old"]],
      ["B", ["b"]],
      ["", ["root"]],
      ["C", ["undated"]],
    ])
  })

  test("each section is cut to a few stories, unless asked for all", () => {
    const many = Array.from({ length: SECTION_STORIES + 3 }, (_, i) => note(`n${i}`, "A", `2026-01-${String(i + 1).padStart(2, "0")}`))
    expect(frontPage(many).sections[0].notes).toHaveLength(SECTION_STORIES)
    expect(frontPage(many, Infinity).sections[0].notes).toHaveLength(many.length - 1)
  })

  test("no notes, no lead", () => {
    expect(frontPage([])).toEqual({ lead: undefined, sections: [] })
  })
})

describe("the date line", () => {
  test("the weekday and the date in full, a date-only value on its own day", () => {
    expect(editionDate(new Date("2026-10-22"), "en-US")).toBe("Thursday, October 22, 2026")
    expect(editionDate(new Date("2026-10-22"), "vi-VN")).toContain("2026")
    expect(editionDate(new Date("2026-10-22T09:30:00Z"), "en-US")).toContain("2026")
  })
})
