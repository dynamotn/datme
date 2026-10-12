import { describe, expect, test } from "bun:test"
import { groupColors, GROUP_COLORS } from "../src/scripts/graph-colors"
import { neighbourhood, parseDepth } from "../src/scripts/graph-hops"

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

describe("local graph depth", () => {
  // 0 - 1 - 2 - 3, and 4 - 0 - 5, with 6 on its own.
  const links: [number, number][] = [
    [0, 1],
    [2, 1],
    [2, 3],
    [4, 0],
    [0, 5],
  ]

  test("one hop keeps the note and its direct links, in both directions", () => {
    expect(neighbourhood(links, 0, 1)).toEqual(
      new Map([
        [0, 0],
        [1, 1],
        [4, 1],
        [5, 1],
      ]),
    )
  })

  test("two hops add the links of those notes, each at its shortest distance", () => {
    const hops = neighbourhood([...links, [1, 5]], 0, 2)
    expect([...hops.keys()].sort()).toEqual([0, 1, 2, 4, 5])
    expect(hops.get(2)).toBe(2)
    expect(hops.get(5)).toBe(1)
    expect(hops.has(3)).toBe(false)
  })

  test("a note without links stands alone", () => {
    expect(neighbourhood(links, 6, 2)).toEqual(new Map([[6, 0]]))
  })

  test("only 1 and 2 are depths; anything else falls back", () => {
    expect(parseDepth("2", 1)).toBe(2)
    expect(parseDepth("1", 2)).toBe(1)
    expect(parseDepth("3", 1)).toBe(1)
    expect(parseDepth(null, 2)).toBe(2)
    expect(parseDepth("", 1)).toBe(1)
  })
})
