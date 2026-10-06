import { describe, expect, test } from "bun:test"
import { parseQuery, runQuery, extractTasks, DataviewError, Unsupported, type Engine, type Page } from "../src/lib/dataview"

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
  page("Books/Dune", { tags: ["type/book"], fields: { book: { author: "Herbert", year: 1965 }, rating: 5 }, outlinks: ["People/Herbert"] }),
  page("Books/Emma", { tags: ["type/book", "classic"], fields: { book: { author: "Austen", year: 1815 }, rating: 4 } }),
  page("People/Herbert", {
    tags: ["type/person"],
    fields: { born: "1920-10-08" },
    inlinks: ["Books/Dune"],
    tasks: extractTasks("1. [ ] call\n* [/] halfway"),
  }),
  page("Inbox/Idea", {
    fields: { related: "[[Dune]]" },
    tasks: extractTasks("- [ ] write #draft 📅 2020-01-02\n- [x] read [priority:: high]\n```\n- [ ] in code\n```"),
  }),
]
const engine: Engine = { pages, resolve: (t) => pages.find((p) => p.stem.toLowerCase() === t.toLowerCase()) }
const run = (q: string) => runQuery(parseQuery(q), engine)
const titles = (q: string) => run(q).rows.map((r) => (r[0] as { title: string }).title)

describe("FROM", () => {
  test("tags include nested tags; folders include subfolders", () => {
    expect(titles("LIST FROM #type")).toEqual(["Dune", "Emma", "Herbert"])
    expect(titles('LIST FROM "Books"')).toEqual(["Dune", "Emma"])
  })

  test("negation, AND, OR and parentheses", () => {
    expect(titles('LIST FROM #type/book AND -#classic')).toEqual(["Dune"])
    expect(titles('LIST FROM !"Books" AND (#type/person OR "Inbox")')).toEqual(["Herbert", "Idea"])
  })

  test("[[link]] selects the notes linking to it", () => {
    expect(titles("LIST FROM [[Herbert]]")).toEqual(["Dune"])
  })
})

describe("WHERE, SORT, LIMIT", () => {
  test("nested fields, comparisons and boolean logic", () => {
    expect(titles("LIST FROM #type/book WHERE book.year > 1900")).toEqual(["Dune"])
    expect(titles('LIST WHERE contains(file.tags, "#classic") OR rating = 5')).toEqual(["Dune", "Emma"])
    expect(titles("LIST WHERE !book")).toEqual(["Herbert", "Idea"])
  })

  test("string functions and file metadata", () => {
    expect(titles('LIST WHERE startswith(file.folder, "Peo")')).toEqual(["Herbert"])
    expect(titles("LIST WHERE length(file.inlinks) > 0")).toEqual(["Herbert"])
  })

  test("sorting by several keys, descending, and limits", () => {
    expect(titles("LIST FROM #type/book SORT rating DESC")).toEqual(["Dune", "Emma"])
    expect(titles("LIST FROM #type/book SORT book.year ASC LIMIT 1")).toEqual(["Emma"])
  })

  test("FLATTEN turns a list into one row per item", () => {
    const res = run("TABLE WITHOUT ID out AS Out FROM #type/book FLATTEN file.outlinks AS out WHERE out")
    expect(res.rows.map((r) => (r[0] as { title: string }).title)).toEqual(["Herbert"])
  })
})

describe("output", () => {
  test("TABLE adds a File column unless WITHOUT ID, with AS names", () => {
    const res = run('TABLE book.author AS "Author", rating FROM #type/book SORT file.name')
    expect(res.headers).toEqual(["File", "Author", "rating"])
    expect(res.rows[0].slice(1)).toEqual(["Herbert", 5])
  })

  test("dates and wikilinks in frontmatter become values", () => {
    const born = run("TABLE WITHOUT ID born FROM #type/person").rows[0][0]
    expect(born).toBeInstanceOf(Date)
    expect(run('TABLE WITHOUT ID related FROM "Inbox"').rows[0][0]).toMatchObject({ kind: "link", key: "Books/Dune" })
  })

  test("LIST with an expression shows the value next to the link", () => {
    expect(run("LIST book.author FROM #type/book SORT file.name").rows[0]).toEqual([
      expect.objectContaining({ title: "Dune" }),
      "Herbert",
    ])
  })
})

describe("GROUP BY", () => {
  test("TABLE shows one row per group, with the key first and rows of the group", () => {
    const res = run('TABLE rows.file.link AS "Notes" FROM #type GROUP BY file.folder')
    expect(res.headers).toEqual(["file.folder", "Notes"])
    expect(res.rows.map((r) => r[0])).toEqual(["Books", "People"])
    expect((res.rows[0][1] as { title: string }[]).map((l) => l.title)).toEqual(["Dune", "Emma"])
  })

  test("groups can be named, filtered and sorted afterwards", () => {
    const res = run("TABLE WITHOUT ID folder, length(rows) AS n FROM #type GROUP BY file.folder AS folder WHERE length(rows) > 1")
    expect(res.rows).toEqual([["Books", 2]])
    expect(run("LIST FROM #type GROUP BY file.folder SORT key DESC").rows.map((r) => r[0])).toEqual(["People", "Books"])
  })

  test("LIST without a column nests the notes of each group", () => {
    const res = run("LIST FROM #type GROUP BY file.folder")
    expect(res.nested).toBe(true)
    expect(res.rows[1]).toEqual(["People", [expect.objectContaining({ title: "Herbert" })]])
  })
})

describe("TASK", () => {
  test("tasks come from list items with a checkbox, never from code", () => {
    const [write, read] = extractTasks("- [ ] write #draft 📅 2020-01-02\n- [x] read [priority:: high]\n```\n- [ ] x\n```")
    expect(write).toEqual({ text: "write #draft 📅 2020-01-02", status: " ", line: 1, tags: ["#draft"], fields: { due: "2020-01-02" } })
    expect(read.fields).toEqual({ priority: "high" })
    expect(extractTasks("```\n- [ ] x\n```")).toEqual([])
  })

  test("tasks are listed under their note", () => {
    const res = run("TASK")
    expect(res.groups!.map((g) => (g.key as { title: string }).title)).toEqual(["Herbert", "Idea"])
    expect(res.groups![1].tasks).toEqual([
      { text: "write #draft 📅 2020-01-02", checked: false },
      { text: "read [priority:: high]", checked: true },
    ])
  })

  test("WHERE sees the task's status, dates, tags and fields", () => {
    const texts = (q: string) => run(q).groups!.flatMap((g) => g.tasks.map((t) => t.text))
    expect(texts("TASK WHERE !completed")).toEqual(["call", "halfway", "write #draft 📅 2020-01-02"])
    expect(texts("TASK WHERE due < date(today)")).toEqual(["write #draft 📅 2020-01-02"])
    expect(texts('TASK WHERE priority = "high"')).toEqual(["read [priority:: high]"])
    expect(texts('TASK WHERE contains(tags, "#draft")')).toEqual(["write #draft 📅 2020-01-02"])
    expect(texts('TASK FROM "People" WHERE checked AND !completed')).toEqual(["halfway"])
  })

  test("GROUP BY regroups tasks by any key", () => {
    const res = run("TASK GROUP BY completed")
    expect(res.groups!.map((g) => [g.key, g.tasks.length])).toEqual([
      [false, 3],
      [true, 1],
    ])
  })
})

describe("errors", () => {
  test("unsupported features are reported as such", () => {
    expect(() => parseQuery("CALENDAR file.ctime")).toThrow(Unsupported)
  })

  test("syntax errors and unknown functions are explained", () => {
    expect(() => parseQuery('LIST FROM "unterminated')).toThrow(DataviewError)
    expect(() => run("LIST WHERE nope(1)")).toThrow("unknown function nope()")
  })
})
