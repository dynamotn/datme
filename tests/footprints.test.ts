import { beforeAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { forgetFootprints, hasVisited, readFootprints, visit } from "../src/scripts/footprints"

describe("footprints", () => {
  const window = new Window({ url: "https://garden.example/" }) as unknown as globalThis.Window & typeof globalThis
  beforeAll(() => {
    Object.assign(globalThis, { localStorage: window.localStorage })
  })

  test("a visit is remembered under the note's path, however it is spelled", () => {
    const f = visit({ visits: {} }, "/Ti%E1%BA%BFng/Note/", "Note", 10)
    expect(hasVisited(f, "/Tiếng/Note")).toBe(true)
    expect(hasVisited(f, "/Other")).toBe(false)
    expect(f.last).toEqual({ u: "/Tiếng/Note", t: "Note", y: 0 })
  })

  test("coming back to the last note keeps where the reader was; another note starts at the top", () => {
    const f = { visits: { "/a": 1 }, last: { u: "/a", t: "A", y: 0.6 } }
    expect(visit(f, "/a/", "A", 2).last!.y).toBe(0.6)
    expect(visit(f, "/b", "B", 2).last).toEqual({ u: "/b", t: "B", y: 0 })
  })

  test("only the newest visits are kept", () => {
    let f = { visits: {} }
    for (let i = 0; i < 5; i++) f = visit(f, `/n${i}`, "", i, 3)
    expect(Object.keys(f.visits).sort()).toEqual(["/n2", "/n3", "/n4"])
  })

  test("broken storage reads as no footprints, and forgetting clears them", () => {
    window.localStorage.setItem("datme:visited", "{not json")
    expect(readFootprints()).toEqual({ visits: {} })
    window.localStorage.setItem("datme:visited", JSON.stringify({ visits: { "/a": 1 } }))
    expect(hasVisited(readFootprints(), "/a")).toBe(true)
    forgetFootprints()
    expect(readFootprints()).toEqual({ visits: {} })
  })
})
