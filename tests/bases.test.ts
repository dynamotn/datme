import { describe, expect, test } from "bun:test"
import { parseBase, parseExpr, runView, BaseError, property } from "../src/lib/bases"
import type { Engine, Page } from "../src/lib/dataview"

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
  page("Books/Dune", { tags: ["type/book"], fields: { author: "Herbert", rating: 5, read: "2024-03-01" } }),
  page("Books/Emma", { tags: ["type/book"], fields: { author: "Austen", rating: 3 } }),
  page("Notes/Idea", { tags: ["idea"], outlinks: ["Books/Dune"] }),
]
const engine: Engine = { pages, resolve: (t) => pages.find((p) => p.stem === t) }
const names = (src: string, view = 0) => {
  const base = parseBase(src)
  return runView(base, base.views[view], engine).rows.map((r) => r.page.stem)
}

describe("expressions", () => {
  test("file helpers, operators and precedence", () => {
    expect(names('views: [{ type: table, filters: \'file.hasTag("type/book") && rating >= 4 || file.name == "Idea"\' }]')).toEqual(["Dune", "Idea"])
    expect(names('views: [{ type: table, filters: \'file.inFolder("Books") && !author.contains("Aus")\' }]')).toEqual(["Dune"])
    expect(names('views: [{ type: table, filters: \'file.hasLink("Dune")\' }]')).toEqual(["Idea"])
  })

  test("and / or / not filter groups, at file and view level", () => {
    const src = `
filters:
  not:
    - 'file.inFolder("Notes")'
views:
  - type: table
    filters:
      or:
        - 'rating == 3'
        - 'read.year() == 2024'
`
    expect(names(src)).toEqual(["Dune", "Emma"])
  })

  test("formulas, sorting and limits", () => {
    const src = `
formulas:
  stars: 'rating * 2'
views:
  - type: table
    filters: 'file.hasTag("type/book")'
    order: [file.name, formula.stars]
    sort: [{ property: formula.stars, direction: DESC }]
    limit: 1
`
    const base = parseBase(src)
    const res = runView(base, base.views[0], engine)
    expect(res.rows.map((r) => r.cells[1])).toEqual([10])
    expect(res.columns.map((c) => c.name)).toEqual(["Name", "stars"])
  })

  test("display names come from properties", () => {
    const base = parseBase("properties:\n  note.author:\n    displayName: Writer\nviews: [{ type: table, order: [file.name, note.author] }]")
    expect(runView(base, base.views[0], engine).columns[1].name).toBe("Writer")
  })

  test("`this` is the current note, and file methods ask about the file they are called on", () => {
    const base = parseBase("views: [{ type: table, filters: 'this.file.hasLink(file)', order: [file.name, this.file.name, this.rating] }]")
    const current = page("Notes/Here", { outlinks: ["Books/Emma"], fields: { rating: 2 } })
    const res = runView(base, base.views[0], { ...engine, pages: [...pages, current], current })
    expect(res.rows.map((r) => [r.page.stem, r.cells[1], r.cells[2]])).toEqual([["Emma", "Here", 2]])
    expect(runView(base, base.views[0], engine).rows).toEqual([])
  })

  test("errors explain what is wrong", () => {
    expect(() => parseExpr('file.hasTag("x"')).toThrow(BaseError)
    expect(() => property("nope()", pages[0], engine, {})).toThrow("unknown function nope()")
    expect(() => property("formula.missing", pages[0], engine, {})).toThrow("unknown formula missing")
    expect(() => parseBase("views: [")).toThrow("invalid YAML")
  })
})
