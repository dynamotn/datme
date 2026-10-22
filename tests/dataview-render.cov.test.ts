import { describe, expect, test } from "bun:test"
import { site } from "../src/site.config"
import { listed } from "../src/lib/vault"
import {
  engineFor,
  html,
  renderContributionGraph,
  renderDataview,
  renderDataviewJs,
  renderInlineQuery,
  renderSearchBlock,
  renderTasksBlock,
} from "../src/lib/dataview-render"
import type { Page } from "../src/lib/dataview"

const LANG = "en-US"
const QUERIES = "03_Atomic/Queries"

/** A page whose every property but its key throws, to reach the paths that rethrow unexpected errors. */
function explosivePage(): Page {
  const boom = () => {
    throw new TypeError("boom")
  }
  const p = { key: "zz/boom" } as Page
  for (const k of ["title", "url", "dir", "stem", "tags", "explicitTags", "fields", "outlinks", "inlinks", "tasks", "created", "updated"]) {
    Object.defineProperty(p, k, { get: boom })
  }
  return p
}

/** Runs `fn` with an exploding page among the language's pages, then takes it out again. */
function withExplosivePage<T>(fn: () => T): T {
  const pages = engineFor(LANG).pages
  pages.push(explosivePage())
  try {
    return fn()
  } finally {
    pages.pop()
  }
}

describe("html of values", () => {
  test("a link to an unpublished note shows its name as text, following privateLinks", () => {
    expect(html({ kind: "link", title: "Private" }, LANG)).toBe('<span class="broken-link">Private</span>')
    const before = site.privateLinks
    site.privateLinks = "hide"
    try {
      expect(html({ kind: "link", title: "Private" }, LANG)).toBe("")
    } finally {
      site.privateLinks = before
    }
  })

  test("a link to a note that does not exist keeps its title", () => {
    expect(html({ kind: "link", title: "No such <note>" }, LANG)).toBe('<span class="broken-link">No such &lt;note&gt;</span>')
  })

  test("objects list their keys and values; booleans, nulls and lists", () => {
    expect(html({ a: 1, "<b>": true }, LANG)).toBe("a: 1; &lt;b&gt;: ✓")
    expect(html([false, null], LANG)).toBe('✗, <span class="dv-null">–</span>')
  })
})

describe("blocks", () => {
  test("a contribution graph reads the published notes of the language", () => {
    const out = renderContributionGraph("title: Notes", LANG, QUERIES)
    expect(out).toContain("Notes")
    expect(out).toContain("<")
  })

  test("an inline query shows its value, a dash for nothing, and an error as code", () => {
    expect(renderInlineQuery("this.rating * 2", LANG, QUERIES)).toBe('<span class="dataview dv-inline">8</span>')
    expect(renderInlineQuery("this.nothing", LANG, QUERIES)).toBe('<span class="dataview dv-inline">-</span>')
    expect(renderInlineQuery("nope(1)", LANG, QUERIES)).toBe('<code class="dataview dv-error" title="Dataview: unknown function nope()">= nope(1)</code>')
    expect(renderInlineQuery("1 1", LANG, QUERIES)).toContain('class="dataview dv-error"')
  })

  test("LIST GROUP BY nests the notes of each group; plain LIST is a list", () => {
    const nested = renderDataview('LIST FROM "06_Reference" GROUP BY file.folder', LANG, QUERIES) as string
    expect(nested).toStartWith('<ul class="dataview dv-list dv-groups"><li>06_Reference<ul><li><a href=')
    expect(nested).toContain("Niklas Luhmann (sociologist)</a></li></ul></li></ul>")
    const list = renderDataview('LIST file.folder FROM "06_Reference"', LANG, QUERIES) as string
    expect(list).toMatch(/^<ul class="dataview dv-list"><li><a [^>]+>Niklas Luhmann \(sociologist\)<\/a>: 06_Reference<\/li><\/ul>$/)
  })

  test("TASK lists tasks as markdown under their note; TABLE is a table with a File column", () => {
    const tasks = renderDataview('TASK FROM "03_Atomic"', LANG, QUERIES) as { markdown: string }
    expect(tasks.markdown).toStartWith('<div class="dataview dv-tasks">\n\n<p class="dv-task-group"><a href=')
    expect(tasks.markdown).toContain("- [ ] Ask")
    expect(tasks.markdown).toContain("- [x] **Read** the paper")
    const table = renderDataview('TABLE file.folder AS "Where" FROM "06_Reference"', LANG, QUERIES) as string
    expect(table).toMatch(
      /^<table class="dataview dv-table"><thead><tr><th>[^<]+<\/th><th>Where<\/th><\/tr><\/thead><tbody><tr><td><a [^>]+>Niklas Luhmann \(sociologist\)<\/a><\/td><td>06_Reference<\/td><\/tr><\/tbody><\/table>$/,
    )
  })

  test("TASK with nothing found is empty; unsupported and broken queries say so", () => {
    const empty = renderDataview('LIST FROM "nowhere"', LANG, QUERIES)
    expect(empty).toMatch(/^<p class="dataview dv-empty">[^<]+<\/p>$/)
    expect(renderDataview('TASK FROM "nowhere"', LANG, QUERIES)).toBe(empty)
    expect(renderDataview("CALENDAR file.ctime", LANG, QUERIES)).toMatch(/^<p class="dataview dv-note">⚙️ .+ \(CALENDAR queries\)<\/p>$/)
    expect(renderDataview("LIST WHERE (", LANG, QUERIES)).toBe('<p class="dataview dv-error">Dataview: unexpected end of query</p>')
  })

  test("DataviewJS is never run, only announced", () => {
    expect(renderDataviewJs(LANG)).toMatch(/^<p class="dataview dv-note">⚙️ .+ \(DataviewJS\)<\/p>$/)
  })

  test("a tasks block that matches nothing is empty; a bad instruction is an error", () => {
    expect(renderTasksBlock("path includes nowhere-at-all", LANG)).toMatch(/^<p class="dataview dv-empty">/)
    expect(renderTasksBlock("frobnicate", LANG)).toBe('<p class="dataview dv-error">Tasks: unsupported instruction &quot;frobnicate&quot;</p>')
  })

  test("a tasks block grouped by a key heads each group", () => {
    const out = renderTasksBlock("path includes Atomic\ngroup by filename", LANG) as { markdown: string }
    expect(out.markdown).toContain('<p class="dv-task-group">')
    expect(out.markdown).toContain("- [ ] Ask")
    expect(out.markdown).toContain("- [x] **Read** the paper")
  })

  test("a search block: empty query, no hits, hits with a snippet, and a broken query", () => {
    expect(renderSearchBlock("   ", LANG)).toBe("")
    expect(renderSearchBlock("zzqqxxnothinglikethis", LANG)).toMatch(/^<p class="dataview dv-empty">/)
    const hits = renderSearchBlock('"slip box"', LANG)
    expect(hits).toStartWith('<ul class="dataview query-results"><li><a class="internal" href=')
    expect(hits).toContain('<p class="query-snippet">')
    expect(renderSearchBlock("(slip", LANG)).toBe('<p class="dataview dv-error">Query: missing &quot;)&quot;</p>')
  })
})

describe("unexpected errors are not swallowed", () => {
  test("inline queries, dataview and tasks blocks rethrow what is not a query error", () => {
    withExplosivePage(() => {
      expect(() => renderInlineQuery("this.file.name", LANG, "zz/boom")).toThrow("boom")
      expect(() => renderDataview("LIST WHERE file.name", LANG, QUERIES)).toThrow("boom")
      expect(() => renderTasksBlock("not done", LANG)).toThrow("boom")
    })
  })

  test("search blocks rethrow what is not a query error", () => {
    const note = listed(LANG).find((n) => !n.protected)!
    const md = Object.getOwnPropertyDescriptor(note, "md")!
    Object.defineProperty(note, "md", {
      configurable: true,
      get() {
        throw new TypeError("boom")
      },
    })
    try {
      expect(() => renderSearchBlock("slip", LANG)).toThrow("boom")
    } finally {
      Object.defineProperty(note, "md", md)
    }
  })
})
