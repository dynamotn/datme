import { describe, expect, test } from "bun:test"
import { textFragment } from "../src/scripts/share"

describe("text fragments", () => {
  test("a short passage is quoted whole, whitespace collapsed", () => {
    expect(textFragment("  a slip   box\nof notes ")).toBe("#:~:text=a%20slip%20box%20of%20notes")
  })

  test("a long passage keeps its first and last words", () => {
    const text = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen"
    expect(textFragment(text)).toBe("#:~:text=one%20two%20three%20four%20five,ten%20eleven%20twelve%20thirteen%20fourteen")
  })

  test("dashes, commas and ampersands are escaped, as the syntax reserves them", () => {
    expect(textFragment("well-known, salt & pepper")).toBe("#:~:text=well%2Dknown%2C%20salt%20%26%20pepper")
    expect(textFragment("Tiếng Việt")).toBe("#:~:text=Ti%E1%BA%BFng%20Vi%E1%BB%87t")
  })

  test("nothing selected, no fragment", () => {
    expect(textFragment("   ")).toBe("")
  })
})
