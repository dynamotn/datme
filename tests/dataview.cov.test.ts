import { describe, expect, test } from "bun:test"
import { compare, evaluateInline, parseQuery, runQuery, scopeOf, DataviewError, Unsupported, type Engine, type Page } from "../src/lib/dataview"

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
  page("Books/Dune", {
    tags: ["type/book"],
    explicitTags: ["type/book"],
    fields: { rating: 5, Genre: "SciFi", scores: [3, 1, 2], names: ["Paul", "Leto"], meta: { a: 1, b: 2 }, friend: "[[Emma|Jane]]", ghost: "[[Nobody]]" },
    outlinks: ["Books/Emma", "Missing/Page"],
    created: new Date("2020-01-01"),
  }),
  page("Books/Emma", { tags: ["type/book", "classic"], fields: { rating: 4, scores: [] }, inlinks: ["Books/Dune"] }),
  page("Notes/Loose", { fields: { rating: null } }),
]
const engine: Engine = { pages, resolve: (t) => pages.find((p) => p.stem.toLowerCase() === t.toLowerCase()) }
const at = (key: string): Engine => ({ ...engine, current: pages.find((p) => p.key === key) })
const ev = (src: string, key = "Books/Dune") => evaluateInline(src, at(key))
const run = (q: string) => runQuery(parseQuery(q), engine)

describe("functions", () => {
  test("contains over lists, text, links and objects", () => {
    expect(ev('contains(names, "Paul")')).toBe(true)
    expect(ev('contains(names, "Alia")')).toBe(false)
    expect(ev('contains(Genre, "Sci")')).toBe(true)
    expect(ev("contains([[Emma]], [[Emma]])")).toBe(true)
    expect(ev('contains(meta, "a")')).toBe(true)
    expect(ev('contains(meta, "z")')).toBe(false)
    expect(ev("contains(rating, 5)")).toBe(false)
  })

  test("icontains, startswith and endswith ignore or keep case", () => {
    expect(ev('icontains(names, "PAUL")')).toBe(true)
    expect(ev('icontains(names, "x")')).toBe(false)
    expect(ev('icontains(Genre, "scifi")')).toBe(true)
    expect(ev('startswith(Genre, "Sci")')).toBe(true)
    expect(ev('endswith(Genre, "Fi")')).toBe(true)
    expect(ev('endswith(nothing, "Fi")')).toBe(false)
  })

  test("length of lists, objects and text; lower and upper", () => {
    expect(ev("length(scores)")).toBe(3)
    expect(ev("length(meta)")).toBe(2)
    expect(ev("length(Genre)")).toBe(5)
    expect(ev("length([[Emma]])")).toBe(4)
    expect(ev("lower(Genre)")).toBe("scifi")
    expect(ev("upper(Genre)")).toBe("SCIFI")
  })

  test("default, choice, join, list, number and string", () => {
    expect(ev("default(nothing, 7)")).toBe(7)
    expect(ev("default(nothing, nothing)")).toBeNull()
    expect(ev('choice(rating > 4, "good", "bad")')).toBe("good")
    expect(ev('choice(false, "good")')).toBeNull()
    expect(ev("join(names)")).toBe("Paul, Leto")
    expect(ev('join(names, " & ")')).toBe("Paul & Leto")
    expect(ev("join(Genre)")).toBe("SciFi")
    expect(ev('list(1, "a")')).toEqual([1, "a"])
    expect(ev('number("4.5 stars")')).toBe(4.5)
    expect(ev('number("none")')).toBeNull()
    expect(ev("string(rating)")).toBe("5")
    expect(ev("string(file.ctime)")).toBe("2020-01-01T00:00:00.000Z")
  })

  test("round, min, max and sum", () => {
    expect(ev("round(2.567, 1)")).toBe(2.6)
    expect(ev("round(2.567)")).toBe(3)
    expect(ev("round(Genre)")).toBeNull()
    expect(ev("min(scores)")).toBe(1)
    expect(ev("max(3, 9, 4)")).toBe(9)
    expect(ev("sum(scores)")).toBe(6)
    expect(ev('sum(1, "x", 2)')).toBe(3)
  })

  test("regexmatch matches the whole text; a bad pattern is no match", () => {
    expect(ev('regexmatch("Sci.*", Genre)')).toBe(true)
    expect(ev('regexmatch("Sci", Genre)')).toBe(false)
    expect(ev('regexmatch("(", Genre)')).toBe(false)
  })

  test("date of a date, of text and of nonsense", () => {
    expect(ev("date(file.ctime)")).toEqual(new Date("2020-01-01"))
    expect(ev('date("2021-03-04")')).toEqual(new Date("2021-03-04"))
    expect(ev('date("not a date")')).toBeNull()
    expect(ev("date(now)")).toBeInstanceOf(Date)
    expect(ev("date(yesterday)")).toBeInstanceOf(Date)
  })

  test("file.etags are the tags written on the page; file.tags adds their parents", () => {
    expect(ev("file.etags")).toEqual(["#type/book"])
    expect(ev("file.tags")).toEqual(["#type", "#type/book"])
  })

  test("link, meta and typeof", () => {
    expect(ev('link("Emma")')).toMatchObject({ kind: "link", key: "Books/Emma" })
    expect(ev('link("Nobody")')).toEqual({ kind: "link", title: "Nobody" })
    expect(ev("meta([[Emma]])")).toEqual({ display: null, embed: false, path: "Books/Emma.md" })
    expect(ev("meta([[Nobody]])")).toEqual({ display: null, embed: false, path: null })
    expect(ev("meta(rating)")).toBeNull()
    expect(ev("typeof(nothing)")).toBe("null")
    expect(ev("typeof(scores)")).toBe("array")
    expect(ev("typeof(file.ctime)")).toBe("date")
    expect(ev("typeof([[Emma]])")).toBe("link")
    expect(ev("typeof(rating)")).toBe("number")
  })
})

describe("expressions", () => {
  test("wikilinks in fields keep their alias, or stay text-only links when unpublished", () => {
    expect(ev("friend")).toMatchObject({ kind: "link", key: "Books/Emma", title: "Jane" })
    expect(ev("ghost")).toEqual({ kind: "link", title: "Nobody" })
  })

  test("members of lists, of unpublished links and of plain values", () => {
    expect(ev("file.outlinks.file.name")).toEqual(["Emma"])
    expect(ev("[[Nobody]].file")).toBeNull()
    expect(ev("[[Nobody]].rating")).toBeNull()
    expect(ev("[[Emma]].rating")).toBe(4)
    expect(ev("rating.x")).toBeNull()
  })

  test("indexes into lists and objects; anything else is null", () => {
    expect(ev("scores[1]")).toBe(1)
    expect(ev("scores[9]")).toBeNull()
    expect(ev('meta["b"]')).toBe(2)
    expect(ev('meta["z"]')).toBeNull()
    expect(ev("rating[0]")).toBeNull()
  })

  test("negation, arithmetic and comparisons with nulls", () => {
    expect(ev("-rating")).toBe(-5)
    expect(ev("-Genre")).toBeNull()
    expect(ev("!rating")).toBe(false)
    expect(ev("rating - 1")).toBe(4)
    expect(ev("Genre - 1")).toBeNull()
    expect(ev("Genre * 2")).toBeNull()
    expect(ev("rating / 0")).toBeNull()
    expect(ev("rating / 2")).toBe(2.5)
    expect(ev('Genre + "!"')).toBe("SciFi!")
    expect(ev("rating <= 5 & rating >= 5")).toBe(true)
    expect(ev("nothing < 1 | nothing > 1")).toBe(false)
    expect(ev("nothing <= 1")).toBe(false)
    expect(ev("nothing >= 1")).toBe(false)
    expect(ev("nothing = null")).toBe(true)
    expect(ev("nothing != null")).toBe(false)
    expect(ev('file.ctime = date("2020-01-01")')).toBe(true)
    expect(ev("scores = scores")).toBe(true)
  })

  test("with no current page, bare fields and this are null", () => {
    expect(evaluateInline("rating", engine)).toBeNull()
    expect(evaluateInline("this", engine)).toBeNull()
    expect(evaluateInline("nil", engine)).toBeNull()
  })

  test("compare orders nulls last, links by title, numbers numerically", () => {
    expect(compare(null, null)).toBe(0)
    expect(compare(null, 1)).toBe(1)
    expect(compare(1, null)).toBe(-1)
    expect(compare({ kind: "link", title: "a" }, { kind: "link", title: "b" })).toBeLessThan(0)
    expect(compare("file2", "file10")).toBeLessThan(0)
    expect(compare([1], [1])).toBe(0)
  })
})

describe("queries", () => {
  test("FROM accepts AND, parentheses and negation; scopeOf reads only tag and folder sources", () => {
    expect(run("LIST FROM #type AND -#classic").rows.map((r) => (r[0] as { title: string }).title)).toEqual(["Dune"])
    expect(run('LIST FROM (#classic OR "Notes")').rows.length).toBe(2)
    expect(run('LIST FROM "Books/Dune.md"').rows.length).toBe(1)
    expect(scopeOf(parseQuery('LIST FROM #type AND !"Notes"'), engine)!.map((p) => p.key)).toEqual(["Books/Dune", "Books/Emma"])
    expect(scopeOf(parseQuery("LIST FROM #type OR [[Emma]]"), engine)).toBeUndefined()
    expect(scopeOf(parseQuery("LIST"), engine)).toBeUndefined()
    expect(run("LIST FROM [[Nobody]]").rows).toEqual([])
  })

  test("SORT accepts ASC, ASCENDING and DESCENDING; equal keys keep their order", () => {
    const names = (q: string) => run(q).rows.map((r) => (r[0] as { title: string }).title)
    // Descending reverses the whole order, so pages without the value come first.
    expect(names("LIST SORT rating DESCENDING")).toEqual(["Loose", "Dune", "Emma"])
    expect(names("LIST SORT rating ASCENDING")).toEqual(["Emma", "Dune", "Loose"])
    expect(names("LIST SORT rating ASC")).toEqual(["Emma", "Dune", "Loose"])
    expect(names("LIST WHERE rating SORT file.folder")).toEqual(["Dune", "Emma"])
  })

  test("LIST WITHOUT ID shows only the value; LIST with a column after GROUP BY shows key and value", () => {
    expect(run("LIST WITHOUT ID rating WHERE rating SORT rating").rows).toEqual([[4], [5]])
    expect(run("LIST length(rows) GROUP BY file.folder").rows).toEqual([
      ["Books", 2],
      ["Notes", 1],
    ])
    expect(run("TABLE WITHOUT ID length(rows) AS n GROUP BY file.folder").headers).toEqual(["n"])
    expect(run("LIST FLATTEN scores WHERE scores SORT scores").rows.length).toBe(3)
  })

  test("syntax errors", () => {
    expect(() => parseQuery("")).toThrow("a query starts with LIST, TABLE or TASK")
    expect(() => parseQuery("CALENDAR file.ctime")).toThrow(Unsupported)
    expect(() => parseQuery("TABLE rating AS 5")).toThrow("expected a column name after AS")
    expect(() => parseQuery("LIST FROM 5")).toThrow('FROM expects #tags, "folders" or [[links]]')
    expect(() => parseQuery("LIST FROM (#a")).toThrow('expected ")"')
    expect(() => parseQuery("LIST LIMIT x")).toThrow("expected num")
    expect(() => parseQuery("LIST WHERE")).toThrow("unexpected end of query")
    expect(() => parseQuery("LIST WHERE AS")).toThrow("unexpected AS")
    expect(() => parseQuery("LIST WHERE )")).toThrow('unexpected ")"')
    expect(() => parseQuery("LIST WHERE 'open")).toThrow("unterminated string")
    expect(() => parseQuery("LIST WHERE [[open")).toThrow("unterminated link")
    expect(() => parseQuery("LIST WHERE a ~ b")).toThrow('unexpected "~"')
    expect(() => parseQuery("LIST rating rating")).toThrow(DataviewError)
    expect(parseQuery('LIST WHERE "a\\"b"').steps).toEqual([{ k: "where", e: { k: "lit", v: 'a"b' } }])
    expect(parseQuery("LIST WHERE f()").steps).toEqual([{ k: "where", e: { k: "call", fn: "f", args: [] } }])
  })
})
