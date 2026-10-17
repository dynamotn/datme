import { describe, expect, mock, test } from "bun:test"

mock.module("astro:transitions/client", () => ({ navigate: () => {} }))
const { decodeWalk, encodeWalk, matchNotes, shortestPath } = await import("../src/scripts/walk")

describe("generated walks", () => {
  // 0 — 1 — 2 — 3, and 0 — 4 — 3: two ways from 0 to 3, the second shorter. 5 stands alone.
  const links: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [0, 4],
    [3, 4],
  ]

  test("the shortest chain of links, followed either way", () => {
    expect(shortestPath(links, 6, 0, 3)).toEqual([0, 4, 3])
    expect(shortestPath(links, 6, 3, 1)).toEqual([3, 2, 1])
    expect(shortestPath(links, 6, 2, 2)).toEqual([2])
  })

  test("no path to a note no link reaches", () => {
    expect(shortestPath(links, 6, 0, 5)).toBeUndefined()
  })

  test("a walk survives a round trip through the address", () => {
    const urls = ["/03_Atomic/Zettelkasten", "/Tiếng Việt/Ghi chú,1"]
    expect(decodeWalk(encodeWalk(urls))).toEqual(urls)
    expect(encodeWalk(urls)).not.toContain("/")
  })

  test("notes are found by title or alias, without minding case or accents", () => {
    const n = (t: string, a: string[] = []) => ({ u: "/" + t, t, a, g: [], p: "", y: [], s: null, f: "", d: "", c: "" })
    const index = { notes: [n("Niklas Luhmann"), n("Việt Nam"), n("Slip box", ["Zettelkasten"]), n("Lu")], links: [] }
    expect(matchNotes(index, "lu", "/Lu")).toEqual([0])
    expect(matchNotes(index, "viet", "/x")).toEqual([1])
    expect(matchNotes(index, "zettel", "/x")).toEqual([2])
    expect(matchNotes(index, "  ", "/x")).toEqual([])
  })
})
