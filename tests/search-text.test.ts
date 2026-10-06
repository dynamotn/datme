import { describe, expect, test } from "bun:test"
import { fold, esc, highlight, snippet } from "../src/scripts/text"
import { samePath } from "../src/scripts/data"

describe("fold", () => {
  test("strips Vietnamese diacritics and đ", () => {
    expect(fold("Ghi Chú Đường Đi")).toBe("ghi chu duong di")
  })
})

describe("highlight", () => {
  test("marks matches found without diacritics, on the original text", () => {
    expect(highlight("Cách ghi chú", ["ghi", "chu"])).toBe("Cách <mark>ghi</mark> <mark>chú</mark>")
  })

  test("escapes HTML in the text", () => {
    expect(highlight("<b>ghi</b>", ["ghi"])).toBe("&lt;b&gt;<mark>ghi</mark>&lt;/b&gt;")
  })

  test("without terms it only escapes", () => {
    expect(highlight("a & b", [])).toBe(esc("a & b"))
  })
})

describe("snippet", () => {
  const long = "x".repeat(200) + " Zettelkasten ghi chú " + "y".repeat(200)

  test("centres on the first match", () => {
    const s = snippet(long, ["ghi"])
    expect(s.startsWith("…")).toBe(true)
    expect(s).toContain("ghi chú")
  })

  test("falls back to the start when nothing matches", () => {
    expect(snippet(long, ["nope"])).toBe("x".repeat(160))
  })
})

describe("samePath", () => {
  test("ignores encoding and trailing slashes", () => {
    expect(samePath("/06_Reference/B%E1%BB%99-n%C3%A3o/", "/06_Reference/Bộ-não")).toBe(true)
    expect(samePath("/", "")).toBe(true)
    expect(samePath("/a", "/b")).toBe(false)
  })
})
