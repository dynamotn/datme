import { describe, expect, test } from "bun:test"
import { bentoOf } from "../src/lib/bento"
import { getVault, listed, type Note } from "../src/lib/vault"
import { site } from "../src/site.config"

// The fixture vault, as a bento home would show it.
describe("bentoOf", () => {
  const b = bentoOf(site.defaultLang)
  const notes = listed(site.defaultLang)

  test("recent notes leave out the home, folder notes and the now note", () => {
    expect(b.recent.length).toBeGreaterThan(0)
    expect(b.recent.length).toBeLessThanOrEqual(6)
    for (const n of b.recent) {
      expect(n.isHome).toBe(false)
      expect(n.source.stem).not.toBe(n.dir.split("/").at(-1))
      expect(n).not.toBe(b.now)
    }
    const times = b.recent.map((n) => n.updated?.getTime() ?? 0)
    expect(times).toEqual([...times].sort((x, y) => y - x))
  })

  test("the now tile is the latest note with layout: now, if any", () => {
    const now = notes.filter((n) => n.layout === "now")
    if (now.length) expect(b.now?.layout).toBe("now")
    else expect(b.now).toBeUndefined()
  })

  test("the hub is the note with the most links in and out, and the stream lists its folder's newest notes", () => {
    const degree = (n: Note) => n.links.length + (getVault().backlinks[site.defaultLang].get(n.key)?.length ?? 0)
    expect(degree(b.hub!)).toBe(Math.max(...b.recent.concat(notes.filter((n) => !n.isHome)).map(degree)))
    expect(b.stream.every((n) => site.appearance.stream.some((f) => n.dir === f || n.dir.startsWith(f + "/")))).toBe(true)
    expect(b.stream.length).toBeGreaterThan(0)
    expect(b.streamUrl).toBe("/08_Journal/")
  })

  test("tags are counted over listed notes, most used first, at most twelve", () => {
    expect(b.tags.length).toBeGreaterThan(0)
    expect(b.tags.length).toBeLessThanOrEqual(12)
    const counts = b.tags.map((t) => t.count)
    expect(counts).toEqual([...counts].sort((x, y) => y - x))
    expect(b.tags.every((t) => t.count > 0)).toBe(true)
  })
})
