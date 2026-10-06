import { describe, expect, test } from "bun:test"
import { groupColors, GROUP_COLORS } from "../src/scripts/graph-colors"

describe("graph colours", () => {
  test("each group gets a colour of its own, the same whatever order notes come in", () => {
    const a = groupColors(["Notes", "Inbox", "Notes", "", "Atomic"])
    const b = groupColors(["Atomic", "Notes", "Inbox"])
    expect([...a]).toEqual([...b])
    expect([...a]).toEqual([
      ["Atomic", GROUP_COLORS[0]],
      ["Inbox", GROUP_COLORS[1]],
      ["Notes", GROUP_COLORS[2]],
    ])
  })

  test("colours wrap around past the palette", () => {
    const many = groupColors(Array.from({ length: GROUP_COLORS.length + 1 }, (_, i) => `g${String(i).padStart(2, "0")}`))
    expect(many.get(`g${String(GROUP_COLORS.length).padStart(2, "0")}`)).toBe(GROUP_COLORS[0])
  })
})
