import { describe, expect, test } from "bun:test"
import { neighbour, randomOther } from "../src/scripts/wander-pick"

const urls = ["/a", "/b", "/c"]

describe("wandering", () => {
  test("a random note is never the current one", () => {
    expect(randomOther(urls, "/a/", () => 0)).toBe("/b")
    expect(randomOther(urls, "/a", () => 0.99)).toBe("/c")
    expect(randomOther(["/a"], "/a")).toBeUndefined()
  })

  test("j and k move along the explorer, stopping at its ends", () => {
    expect(neighbour(urls, "/b", 1)).toBe("/c")
    expect(neighbour(urls, "/b", -1)).toBe("/a")
    expect(neighbour(urls, "/c", 1)).toBeUndefined()
    expect(neighbour(urls, "/tags", 1)).toBe("/a")
    expect(neighbour(urls, "/tags", -1)).toBe("/c")
    expect(neighbour([], "/a", 1)).toBeUndefined()
  })
})
