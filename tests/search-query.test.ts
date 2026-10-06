import { describe, expect, test } from "bun:test"
import { parseSearch, search, highlight, fold, SearchQueryError, type Searchable } from "../src/lib/search-query"

const docs: Searchable[] = [
  { title: "Zettelkasten", path: "Atomic/Zettelkasten.md", tags: ["theme/pkm"], text: "A slip box of notes.\nLinked by Luhmann." },
  { title: "Tiếng Việt", path: "Notes/Viet.md", tags: ["lang/vi"], text: "Ghi chú tiếng Việt về hộp phiếu." },
  { title: "Garden", path: "Notes/Garden.md", tags: [], text: "Notes grow slowly.\nA box of seeds." },
]
const titles = (q: string) => search(parseSearch(q)!, docs).map((h) => h.doc.title)

describe("Obsidian search", () => {
  test("words must all match, anywhere in the note; phrases must match as written", () => {
    expect(titles("box notes")).toEqual(["Zettelkasten", "Garden"])
    expect(titles('"slip box"')).toEqual(["Zettelkasten"])
  })

  test("OR, negation and parentheses", () => {
    expect(titles("luhmann OR seeds")).toEqual(["Zettelkasten", "Garden"])
    expect(titles("box -luhmann")).toEqual(["Garden"])
    expect(titles("(luhmann OR viet) -tag:#lang")).toEqual(["Zettelkasten"])
  })

  test("operators: tag with nesting, path, file, line", () => {
    expect(titles("tag:#theme")).toEqual(["Zettelkasten"])
    expect(titles("path:Notes")).toEqual(["Tiếng Việt", "Garden"])
    expect(titles("file:garden")).toEqual(["Garden"])
    // Both words on one line: "box" and "notes" share a line only in the Zettelkasten note.
    expect(titles("line:(box notes)")).toEqual(["Zettelkasten"])
  })

  test("case and Vietnamese accents are ignored", () => {
    expect(fold("Hộp PHIẾU đỏ")).toBe("hop phieu do")
    expect(titles("hop phieu")).toEqual(["Tiếng Việt"])
  })

  test("the matching line comes back with the words marked", () => {
    const [hit] = search(parseSearch("hop")!, docs)
    expect(highlight(hit.snippet!, hit.words)).toBe("Ghi chú tiếng Việt về <mark>hộp</mark> phiếu.")
    expect(highlight("<b> & box", ["box"])).toBe("&lt;b&gt; &amp; <mark>box</mark>")
  })

  test("mistakes are reported", () => {
    expect(() => parseSearch("(box")).toThrow(SearchQueryError)
    expect(() => parseSearch("block:x")).toThrow('unsupported operator "block:"')
    expect(parseSearch("   ")).toBeUndefined()
  })
})
