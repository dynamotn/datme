import { describe, expect, test } from "bun:test"
import { parseCanvas, edgePath, bounds, canvasColor } from "../src/lib/canvas"
import { getVault } from "../src/lib/vault"

describe("canvas format", () => {
  test("drops malformed nodes and dangling edges", () => {
    const c = parseCanvas(
      JSON.stringify({
        nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 10, height: 10 }, { id: "b", type: "weird" }, { type: "text" }],
        edges: [{ id: "e", fromNode: "a", toNode: "b" }],
      }),
    )
    expect(c.nodes.map((n) => n.id)).toEqual(["a"])
    expect(c.edges).toEqual([])
  })

  test("preset and hex colours, nothing else", () => {
    expect(canvasColor("1")).toBe("#fb464c")
    expect(canvasColor("#abc")).toBe("#abc")
    expect(canvasColor("red;}")).toBeUndefined()
  })

  test("edges leave from the facing sides when none are given", () => {
    const a = { id: "a", type: "text" as const, x: 0, y: 0, width: 100, height: 50 }
    const b = { id: "b", type: "text" as const, x: 300, y: 0, width: 100, height: 50 }
    expect(edgePath(a, b, {}).d.startsWith("M100,25 ")).toBe(true)
    expect(edgePath(a, b, {}).d.endsWith(" 300,25")).toBe(true)
    expect(bounds([a, b])).toEqual({ x: 0, y: 0, width: 400, height: 50 })
  })
})

describe("published canvases", () => {
  const vault = getVault()

  test("only canvases linked from a published note are published", () => {
    expect([...vault.docs.keys()].sort()).toEqual(["05_Structure/Library.base", "07_Project/Map.canvas"])
  })

  test("text cards are filtered per language and keep links to published notes only", () => {
    const doc = vault.docs.get("07_Project/Map.canvas")!
    expect(doc.texts["vi-VN"].t1).not.toContain("English card")
    expect(doc.texts["en-US"].t1).toContain("English card")
    expect(doc.texts["vi-VN"].t1).toContain('href="/03_Atomic/Zettelkasten"')
    expect(doc.texts["vi-VN"].t1).toContain('<span class="broken-link" title="Not published">Private</span>')
  })
})
