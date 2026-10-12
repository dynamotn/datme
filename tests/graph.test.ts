import { describe, expect, test } from "bun:test"
import { groupColors, GROUP_COLORS } from "../src/scripts/graph-colors"
import { neighbourhood, parseDepth } from "../src/scripts/graph-hops"
import { bounds, MAX_PITCH, project, tilt } from "../src/scripts/graph-3d"

describe("3D graph", () => {
  const front = { yaw: 0, pitch: 0 }

  test("seen from the front, a point on the centre plane stays where it is", () => {
    const p = project({ x: 10, y: -5, z: 0 }, front, 100)
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(-5)
    expect(p.s).toBeCloseTo(1)
  })

  test("nearer points are drawn larger, farther ones smaller", () => {
    const near = project({ x: 10, y: 0, z: 50 }, front, 100)
    const far = project({ x: 10, y: 0, z: -50 }, front, 100)
    expect(near.s).toBeGreaterThan(1)
    expect(far.s).toBeLessThan(1)
    expect(near.x).toBeGreaterThan(far.x)
    expect(near.z).toBeGreaterThan(far.z)
  })

  test("a quarter turn brings a point on the side to the front", () => {
    const p = project({ x: 10, y: 0, z: 0 }, { yaw: -Math.PI / 2, pitch: 0 }, 100)
    expect(p.x).toBeCloseTo(0)
    expect(p.z).toBeCloseTo(10)
  })

  test("a point behind the eye does not blow up", () => {
    expect(Number.isFinite(project({ x: 1, y: 1, z: 500 }, front, 100).s)).toBe(true)
  })

  test("tilting stops short of looking straight down or up", () => {
    expect(tilt(0, 10)).toBe(MAX_PITCH)
    expect(tilt(0, -10)).toBe(-MAX_PITCH)
    expect(tilt(0.2, 0.1)).toBeCloseTo(0.3)
  })

  test("the bounds of a cloud are its centre and the distance to its farthest point", () => {
    expect(bounds([])).toEqual({ centre: { x: 0, y: 0, z: 0 }, radius: 0 })
    const b = bounds([
      { x: 2, y: 0, z: 0 },
      { x: -2, y: 0, z: 0 },
      { x: 0, y: 3, z: 0 },
      { x: 0, y: -3, z: 4 },
    ])
    expect(b.centre).toEqual({ x: 0, y: 0, z: 1 })
    expect(b.radius).toBeCloseTo(Math.hypot(3, 3))
  })
})

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
