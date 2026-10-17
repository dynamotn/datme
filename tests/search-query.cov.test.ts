import { describe, expect, test } from "bun:test"
import { highlight, parseSearch, search, SearchQueryError, type Searchable } from "../src/lib/search-query"

const docs: Searchable[] = [
  { title: "Roses", path: "Plants/Roses.md", tags: ["garden/flowers"], text: "Roses need sun.\nPrune them in winter." },
  { title: "Winter", path: "Seasons/Winter.md", tags: ["season"], text: "Cold days.\nThe garden sleeps." },
]

describe("search edge cases", () => {
  test("a title alone can match a word; a lone dash is a word", () => {
    expect(search(parseSearch("winter")!, docs).map((h) => h.doc.title)).toEqual(["Roses", "Winter"])
    expect(search(parseSearch("-")!, [{ title: "Dash", path: "d.md", tags: [], text: "a - b" }]).map((h) => h.doc.title)).toEqual(["Dash"])
  })

  test("negated words and operators that are not about content give no snippet words", () => {
    const [hit] = search(parseSearch("tag:#garden -cold path:plants")!, docs)
    expect(hit).toEqual({ doc: docs[0], snippet: undefined, words: [] })
    // A word under two negations counts again: no line lacks "prune".
    const pruned = { title: "P", path: "p.md", tags: [], text: "prune\nPrune it" }
    expect(search(parseSearch("-line:(-prune)")!, [pruned, docs[0]])).toEqual([{ doc: pruned, snippet: "prune", words: ["prune"] }])
  })

  test("a dash before parentheses negates the whole group, as in Obsidian", () => {
    expect(search(parseSearch("garden -(cold sleeps)")!, docs).map((h) => h.doc.title)).toEqual([])
    expect(search(parseSearch("winter -(cold days)")!, docs).map((h) => h.doc.title)).toEqual(["Roses"])
  })

  test("words of a line: operator are searched for, and a negation inside it applies per line", () => {
    const hits = search(parseSearch('line:(prune -sun) OR file:"winter"')!, docs)
    expect(hits.map((h) => [h.doc.title, h.snippet])).toEqual([
      ["Roses", "Prune them in winter."],
      ["Winter", undefined],
    ])
    expect(hits[0].words).toEqual(["prune"])
  })

  test("the snippet is the first line holding any searched word, trimmed", () => {
    const [hit] = search(parseSearch("sleeps OR days")!, [{ title: "T", path: "t.md", tags: [], text: "  Cold days.  \nsleeps" }])
    expect(hit.snippet).toBe("Cold days.")
  })

  test("malformed queries say what is wrong", () => {
    const err = (q: string) => {
      try {
        parseSearch(q)
      } catch (e) {
        expect(e).toBeInstanceOf(SearchQueryError)
        return (e as Error).message
      }
      throw new Error(`no error for ${q}`)
    }
    expect(err("box OR")).toBe("unexpected end of query")
    expect(err("box)")).toBe('unexpected ")"')
    expect(err("line:box")).toBe('line: expects "(…)"')
    expect(err("line:(box")).toBe('missing ")"')
  })
})

describe("highlight", () => {
  test("marks every occurrence of every word in text order, overlapping ones once", () => {
    expect(highlight("Rose garden, rosé wine", ["rose", "garden", "ros"])).toBe("<mark>Rose</mark> <mark>garden</mark>, <mark>rosé</mark> wine")
  })

  test("empty words and no words leave the text escaped", () => {
    expect(highlight("a < b", ["", "~"])).toBe("a &lt; b")
    expect(highlight("x", [])).toBe("x")
  })
})
