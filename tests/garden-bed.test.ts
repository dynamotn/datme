import { describe, expect, test } from "bun:test"
import { relativeTended, tileMatches } from "../src/scripts/garden-bed"

describe("garden bed", () => {
  const now = new Date("2026-10-17T12:00:00Z")
  test("recent tending reads as relative time, older stays absolute", () => {
    expect(relativeTended(new Date("2026-10-14T12:00:00Z"), "en-US", now)).toBe("3 days ago")
    expect(relativeTended(new Date("2026-10-14T12:00:00Z"), "vi-VN", now)).toBe("3 ngày trước")
    expect(relativeTended(new Date("2026-10-16T12:00:00Z"), "en-US", now)).toBe("yesterday")
    expect(relativeTended(new Date("2026-10-17T09:00:00Z"), "en-US", now)).toBe("3 hours ago")
    expect(relativeTended(new Date("2026-09-01T00:00:00Z"), "en-US", now)).toBeUndefined()
    expect(relativeTended(new Date("2026-10-20T00:00:00Z"), "en-US", now)).toBeUndefined()
  })
  test("a tile matches every active filter", () => {
    const tile = { stage: "tree", folder: "Notes", tags: ["pkm", "garden"] }
    expect(tileMatches(tile, {})).toBe(true)
    expect(tileMatches(tile, { stage: "tree", tag: "pkm" })).toBe(true)
    expect(tileMatches(tile, { stage: "seed" })).toBe(false)
    expect(tileMatches(tile, { tag: "pk" })).toBe(false)
    expect(tileMatches(tile, { folder: "Notes" })).toBe(true)
  })
})
