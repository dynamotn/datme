import { describe, expect, test } from "bun:test"
import { BaseError, columnName, parseBase, parseExpr, property, runView } from "../src/lib/bases"
import type { Engine, Link, Page } from "../src/lib/dataview"

const page = (key: string, over: Partial<Page> = {}): Page => ({
  key,
  title: key.split("/").pop()!,
  url: "/" + key,
  dir: key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "",
  stem: key.split("/").pop()!,
  tags: [],
  explicitTags: [],
  fields: {},
  outlinks: [],
  inlinks: [],
  ...over,
})
const pages = [
  page("Books/Dune", { tags: ["type/book"], fields: { author: "Herbert", rating: 5, read: "2024-03-01", genre: "scifi" }, outlinks: ["Books/Emma"] }),
  page("Books/Emma", { tags: ["type/book"], fields: { author: "Austen", rating: 3, genre: "classic" } }),
  page("Notes/Idea", { tags: ["idea"], fields: { rating: 5, genre: "scifi" }, outlinks: ["Books/Dune"] }),
]
const engine: Engine = { pages, resolve: (t) => pages.find((p) => p.stem === t) }
const [dune, emma, idea] = pages
const ev = (src: string, p: Page = dune, formulas: Record<string, string> = {}, eng: Engine = engine) => property(src, p, eng, formulas)

describe("expression syntax", () => {
  test("literals, parentheses, list literals and escapes", () => {
    expect(ev("null")).toBeNull()
    expect(ev("true")).toBe(true)
    expect(ev("false")).toBe(false)
    expect(ev("(1 + 2) * 3")).toBe(9)
    expect(ev("1 + 2 * 3")).toBe(7)
    expect(ev("[1, 'a', rating]")).toEqual([1, "a", 5])
    expect(ev("[]")).toEqual([])
    expect(ev('"a\\"b"')).toBe('a"b')
    expect(ev("2.5 * 2")).toBe(5)
  })

  test("syntax errors are BaseErrors with a reason", () => {
    expect(() => parseExpr("'open")).toThrow("unterminated string")
    expect(() => parseExpr("a @ b")).toThrow('unexpected "@"')
    expect(() => parseExpr("")).toThrow("unexpected end of expression")
    expect(() => parseExpr("a.(b)")).toThrow("expected a name after .")
    expect(() => parseExpr("a.")).toThrow("expected a name after .")
    expect(() => parseExpr("(1 + 2")).toThrow('expected ")"')
    expect(() => parseExpr("a[1")).toThrow('expected "]"')
    expect(() => parseExpr("1 2")).toThrow('unexpected "2"')
    expect(() => parseExpr(")")).toThrow('unexpected ")"')
    expect(() => ev('"abc"(1)')).toThrow("only functions and methods can be called")
  })
})

describe("operators", () => {
  test("comparisons, with null on either side", () => {
    expect(ev("rating < 6")).toBe(true)
    expect(ev("rating > 6")).toBe(false)
    expect(ev("rating <= 5")).toBe(true)
    expect(ev("rating >= 6")).toBe(false)
    expect(ev("missing < 6")).toBe(false)
    expect(ev("missing > 6")).toBe(false)
    expect(ev("missing <= 6")).toBe(false)
    expect(ev("missing >= 6")).toBe(false)
    expect(ev("missing == null")).toBe(true)
    expect(ev("missing == 1")).toBe(false)
    expect(ev("missing != null")).toBe(false)
    expect(ev("missing != 1")).toBe(true)
    expect(ev("rating != 4")).toBe(true)
  })

  test("arithmetic on numbers, null otherwise, no division by zero", () => {
    expect(ev("rating - 1")).toBe(4)
    expect(ev("rating * 2")).toBe(10)
    expect(ev("rating / 2")).toBe(2.5)
    expect(ev("rating % 2")).toBe(1)
    expect(ev("rating / 0")).toBeNull()
    expect(ev("rating % 0")).toBeNull()
    expect(ev("author - 1")).toBeNull()
    expect(ev("author * 1")).toBeNull()
    expect(ev("author / 1")).toBeNull()
    expect(ev("author % 1")).toBeNull()
    expect(ev("-rating")).toBe(-5)
    expect(ev("-author")).toBeNull()
    expect(ev("!missing")).toBe(true)
  })

  test("+ joins text, dates, links and lists", () => {
    expect(ev('author + "!"')).toBe("Herbert!")
    expect(ev('read + ""')).toBe("2024-03-01T00:00:00.000Z")
    expect(ev('file.link + ""')).toBe("Dune")
    expect(ev('file.tags + ""')).toBe("type/book")
    expect(ev('missing + "x"')).toBe("x")
  })
})

describe("variables and members", () => {
  test("note, formula and this", () => {
    expect(ev("note.author")).toBe("Herbert")
    expect(ev("this")).toBeNull()
    expect(ev("this.author", dune, {}, { ...engine, current: emma })).toBe("Austen")
    // `formula` alone is an internal marker, not a value readers see.
    expect(ev("formula.x", dune, { x: "rating + 1" })).toBe(6)
  })

  test("formulas referring to each other in a loop stop with an error", () => {
    expect(() => ev("formula.a", dune, { a: "formula.b", b: "formula.a" })).toThrow("formulas refer to each other in a loop")
  })

  test("length of lists and text, null for others; members of non-objects are null", () => {
    expect(ev("author.length")).toBe(7)
    expect(ev("file.tags.length")).toBe(1)
    expect(ev("rating.length")).toBeNull()
    expect(ev("read.foo")).toBeNull()
    expect(ev("file.link.title")).toBeNull()
    expect(ev("file.tags.foo")).toBeNull()
    expect(ev("note.missing")).toBeNull()
  })

  test("value and index outside a filter are note properties", () => {
    const p = page("Notes/V", { fields: { value: "mine", index: 7 } })
    expect(ev("value", p)).toBe("mine")
    expect(ev("index", p)).toBe(7)
  })

  test("filter() and map() on a non-list are null; map() without an argument gives nulls", () => {
    expect(ev("author.filter(value)")).toBeNull()
    expect(ev("author.map(value)")).toBeNull()
    expect(ev("file.tags.map()")).toEqual([null])
  })

  test("file properties", () => {
    const p = page("Notes/Dated", { created: new Date("2024-01-01"), updated: new Date("2024-02-01") })
    expect(ev("file.path", p)).toBe("Notes/Dated.md")
    expect(ev("file.folder", p)).toBe("Notes")
    expect(ev("file.ext", p)).toBe("md")
    expect(ev("file.basename", p)).toBe("Dated")
    expect(ev("file.ctime", p)).toEqual(new Date("2024-01-01"))
    expect(ev("file.mtime", p)).toEqual(new Date("2024-02-01"))
    expect(ev("file.ctime")).toBeNull()
    // Links to notes outside the engine are dropped.
    expect(ev("file.links", page("Notes/L", { outlinks: ["Books/Dune", "Gone"] }))).toEqual([
      { kind: "link", key: "Books/Dune", title: "Dune", url: "/Books/Dune" },
    ])
  })
})

describe("functions", () => {
  test("if(), date(), number(), list(), min(), max()", () => {
    expect(ev('if(rating > 4, "good", "bad")')).toBe("good")
    expect(ev('if(rating > 9, "good", "bad")')).toBe("bad")
    expect(ev('if(rating > 9, "good")')).toBeNull()
    expect(ev("now()")).toBeInstanceOf(Date)
    expect(ev('date("2024-05-06")')).toEqual(new Date("2024-05-06"))
    expect(ev('date("not a date")')).toBeNull()
    expect(ev('number("3.5kg")')).toBe(3.5)
    expect(ev('number("abc")')).toBeNull()
    expect(ev("list(file.tags)")).toEqual(["type/book"])
    expect(ev("list(rating)")).toEqual([5])
    expect(ev("min(3, 1, 2)")).toBe(1)
    expect(ev("max(3, 1, 2)")).toBe(3)
    expect(ev("min()")).toBeNull()
    expect(ev("max()")).toBeNull()
  })
})

describe("methods", () => {
  test("file methods on nothing match nothing", () => {
    expect(ev('this.file.hasTag("x")')).toBe(false)
    expect(ev('this.file.inFolder("x")')).toBe(false)
  })

  test("hasLink by link, by file object and by name; hasProperty", () => {
    expect(ev("file.hasLink(this.file)", idea, {}, { ...engine, current: dune })).toBe(true)
    expect(ev("file.hasLink(this.file.link)", idea, {}, { ...engine, current: dune })).toBe(true)
    expect(ev('file.hasLink("Emma")')).toBe(true)
    expect(ev('file.hasLink("Nobody")')).toBe(false)
    expect(ev('file.hasProperty("author")')).toBe(true)
    expect(ev('file.hasProperty("nope")')).toBe(false)
    expect(ev('file.inFolder("/Books/")')).toBe(true)
    expect(ev('file.hasTag("type")')).toBe(true)
  })

  test("another note's file methods ask about that note", () => {
    expect(ev('this.file.hasTag("idea")', dune, {}, { ...engine, current: idea })).toBe(true)
  })

  test("a file method on a file not in the engine falls through to an unknown method", () => {
    const stranger = page("Else/Stranger")
    expect(() => ev('this.file.hasProperty("x")', dune, {}, { ...engine, current: stranger })).toThrow("unknown method .hasProperty()")
  })

  test("indexing", () => {
    expect(ev("file.tags[0]")).toBe("type/book")
    expect(ev("file.tags[5]")).toBeNull()
    expect(ev('file.tags["x"]')).toBeNull()
    expect(ev("read[0]")).toBeNull()
    expect(ev('file.link["title"]')).toBeNull()
    expect(ev("note[1]")).toBeNull()
  })

  test("text and list methods", () => {
    expect(ev('author.contains("erb")')).toBe(true)
    expect(ev('file.tags.contains("type/book")')).toBe(true)
    expect(ev('author.containsAny("zz", "Her")')).toBe(true)
    expect(ev('file.tags.containsAny("zz", "type/book")')).toBe(true)
    expect(ev('file.tags.containsAny("zz")')).toBe(false)
    expect(ev('author.containsAll("He", "rt")')).toBe(true)
    expect(ev('author.containsAll("He", "zz")')).toBe(false)
    expect(ev('file.tags.containsAll("type/book")')).toBe(true)
    expect(ev('author.startsWith("Her")')).toBe(true)
    expect(ev('author.endsWith("bert")')).toBe(true)
    expect(ev("author.isEmpty()")).toBe(false)
    expect(ev("missing.isEmpty()")).toBe(true)
    expect(ev("author.lower()")).toBe("herbert")
    expect(ev("author.upper()")).toBe("HERBERT")
    expect(ev('" pad ".trim()')).toBe("pad")
    expect(ev("rating.toString()")).toBe("5")
    expect(ev("[1, 2].join()")).toBe("1, 2")
    expect(ev('[1, 2].join("-")')).toBe("1-2")
    expect(ev('author.join("-")')).toBe("Herbert")
  })

  test("year() and round()", () => {
    expect(ev("read.year()")).toBe(2024)
    expect(ev("author.year()")).toBeNull()
    expect(ev("(rating / 3).round()")).toBe(2)
    expect(ev("(rating / 3).round(2)")).toBe(1.67)
    expect(ev('(rating / 3).round("x")')).toBe(2)
    expect(ev("author.round()")).toBeNull()
  })

  test("unknown methods are errors", () => {
    expect(() => ev("author.shout()")).toThrow("unknown method .shout()")
  })

  test("round() with digits out of range is clamped, not a crash", () => {
    expect(ev("(rating / 3).round(101)")).toBe(5 / 3)
    expect(ev("(rating / 3).round(-1)")).toBe(2)
  })
})

describe("parsing a base", () => {
  test("view defaults, groupBy shapes and file-level options", () => {
    const base = parseBase(
      "properties:\n  note.a: { displayName: A }\n  note.b: {}\n  note.c:\nformulas: { n: 1 }\nviews:\n  - { type: cards, image: note.cover, limit: 2, groupBy: note.genre }\n  - { groupBy: { property: note.genre } }\n  - { groupBy: { property: note.genre, direction: desc }, sort: [{ property: note.rating }] }",
    )
    expect(base.displayNames).toEqual({ "note.a": "A" })
    expect(base.formulas).toEqual({ n: "1" })
    expect(base.views[0]).toMatchObject({
      type: "cards",
      name: "View 1",
      image: "note.cover",
      limit: 2,
      order: ["file.name"],
      groupBy: { property: "note.genre", direction: "ASC" },
    })
    expect(base.views[1].groupBy).toEqual({ property: "note.genre", direction: "ASC" })
    expect(base.views[1].type).toBe("table")
    expect(base.views[2].groupBy!.direction).toBe("DESC")
    expect(base.views[2].sort).toEqual([{ property: "note.rating", direction: "ASC" }])
    expect(() => parseBase("views: [{ groupBy: { direction: DESC } }]")).toThrow("groupBy needs a property")
  })

  test("an empty file is one table of every note", () => {
    expect(parseBase("").views.map((v) => v.type)).toEqual(["table"])
    expect(parseBase("# nothing yet\n").views.map((v) => v.type)).toEqual(["table"])
  })

  test("a null document is one table of every note", () => {
    const base = parseBase("~")
    expect(base.views).toEqual([
      {
        type: "table",
        name: "Table",
        filters: undefined,
        order: ["file.name"],
        sort: [],
        limit: undefined,
        image: undefined,
        groupBy: undefined,
        options: { type: "table", name: "Table" },
      },
    ])
  })

  test("column names", () => {
    const base = parseBase("properties:\n  formula.x: { displayName: Ex }")
    expect(columnName("formula.x", base)).toBe("Ex")
    expect(columnName("file.name", base)).toBe("Name")
    expect(columnName("note.author", base)).toBe("author")
    expect(columnName("plain", base)).toBe("plain")
  })
})

describe("running a view", () => {
  test("or and not groups as lists; an empty filter object passes everything", () => {
    const base = parseBase("filters: {}\nviews: [{ filters: { or: ['rating == 3', 'rating == 5'] } }, { filters: { not: ['rating == 3'] } }]")
    expect(runView(base, base.views[0], engine).rows.map((r) => r.page.stem)).toEqual(["Dune", "Emma", "Idea"])
    expect(runView(base, base.views[1], engine).rows.map((r) => r.page.stem)).toEqual(["Dune", "Idea"])
    const both = parseBase("filters: { and: ['rating == 5', 'file.inFolder(\"Books\")'] }")
    expect(runView(both, both.views[0], engine).rows.map((r) => r.page.stem)).toEqual(["Dune"])
    const bad = parseBase("views: [{ filters: { or: 'x' } }, { filters: { not: 'x' } }]")
    expect(() => runView(bad, bad.views[0], engine)).toThrow("or must be a list")
    expect(() => runView(bad, bad.views[1], engine)).toThrow("not must be a list")
  })

  test("ties on the first sort key fall to the next, and full ties keep their order", () => {
    const base = parseBase(
      "views: [{ sort: [{ property: note.rating, direction: DESC }, { property: file.name, direction: DESC }] }, { sort: [{ property: note.genre }, { property: note.rating }] }]",
    )
    expect(runView(base, base.views[0], engine).rows.map((r) => r.page.stem)).toEqual(["Idea", "Dune", "Emma"])
    const twins = [page("A/One", { fields: { genre: "x", rating: 1 } }), page("A/Two", { fields: { genre: "x", rating: 1 } })]
    expect(runView(base, base.views[1], { pages: twins, resolve: () => undefined }).rows.map((r) => r.page.stem)).toEqual(["One", "Two"])
  })

  test("image and order cells, and groups by value with empty lists under no group", () => {
    const withLists = [...pages, page("Notes/Empty", { fields: { genre: [] } }), page("Notes/Blank", { fields: { genre: "" } })]
    const base = parseBase("views: [{ image: note.author, order: [file.name, note.rating], groupBy: { property: note.genre, direction: DESC } }]")
    const res = runView(base, base.views[0], { pages: withLists, resolve: () => undefined })
    expect(res.rows[0].image).toBe("Herbert")
    expect((res.rows[0].cells[0] as Link).title).toBe("Dune")
    expect(res.groups!.map((g) => [g.key, g.rows.map((r) => r.page.stem)])).toEqual([
      ["scifi", ["Dune", "Idea"]],
      ["classic", ["Emma"]],
      [null, ["Empty", "Blank"]],
    ])
  })

  test("a view without groupBy has no groups", () => {
    const base = parseBase("views: [{ type: table }]")
    expect(runView(base, base.views[0], engine).groups).toBeUndefined()
  })

  test("BaseError is an Error", () => {
    expect(new BaseError("x")).toBeInstanceOf(Error)
  })
})
