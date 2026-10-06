import { describe, expect, test } from "bun:test"
import { sluggify, sluggifySegment, slugTag, slugToUrl, folderDisplayName } from "../src/lib/slug"

describe("sluggify", () => {
  test("matches Quartz: spaces become dashes, case and diacritics are kept", () => {
    expect(sluggify("06_Reference/Bộ não thứ 2")).toBe("06_Reference/Bộ-não-thứ-2")
  })

  test("drops ? and #, spells out & and %", () => {
    expect(sluggifySegment("Why? #1 & 100%")).toBe("Why-1--and--100-percent")
  })

  test("ignores empty segments", () => {
    expect(sluggify("/a//b/")).toBe("a/b")
  })
})

describe("slugTag", () => {
  test("keeps the tag hierarchy", () => {
    expect(slugTag("type/blog")).toBe("type/blog")
    expect(slugTag(" my tag / sub ")).toBe("my-tag/sub")
  })
})

describe("slugToUrl", () => {
  test("maps index slugs to their folder", () => {
    expect(slugToUrl("index")).toBe("/")
    expect(slugToUrl("")).toBe("/")
    expect(slugToUrl("en-US/index")).toBe("/en-US")
  })

  test("percent-encodes each segment but keeps slashes", () => {
    expect(slugToUrl("06_Reference/Bộ-não")).toBe("/06_Reference/B%E1%BB%99-n%C3%A3o")
  })
})

describe("folderDisplayName", () => {
  test("strips Zettelkasten numbering", () => {
    expect(folderDisplayName("06_Reference")).toBe("Reference")
    expect(folderDisplayName("02.01_Books")).toBe("Books")
    expect(folderDisplayName("Plain")).toBe("Plain")
  })
})
