import { describe, expect, test } from "bun:test"
import { parseTabs, columnsHtml } from "../src/lib/layouts"
import { preprocess, type LinkTarget } from "../src/lib/obsidian"
import { renderMarkdown } from "../src/lib/markdown"

const target: LinkTarget = { key: "06_Reference/Target" }
const run = (src: string, slides = false) =>
  preprocess(src, {
    lang: "en-US",
    dir: "03_Atomic",
    resolveNote: (t) => (t.toLowerCase() === "target" ? target : undefined),
    resolveAsset: () => undefined,
    slides,
  })
const render = async (src: string) => renderMarkdown(run(src).md, "en-US", "x")

describe("tabs", () => {
  test("every plugin's title line starts a tab; text before the first is a tab too", () => {
    expect(parseTabs("lead\n--- One\na\n---tab Two\nb\ntab: Three\nc\n")).toEqual([
      { title: "", body: "lead\n" },
      { title: "One", body: "a\n" },
      { title: "Two", body: "b\n" },
      { title: "Three", body: "c\n\n" },
    ])
  })

  test("a title line inside a code block of a tab stays code", () => {
    expect(parseTabs("--- A\n```\n--- not a tab\n```\n").map((t) => t.title)).toEqual(["A"])
  })

  test("the content of each tab is converted like the rest of the note", async () => {
    const { md, links } = run("````tabs\n--- First\nSee [[Target]]\n\n```js\nlet a = 1\n```\n--- Second\n> [!tip] Tip\n> body\n````")
    expect(links.map((l) => l.key)).toEqual(["06_Reference/Target"])
    const html = await renderMarkdown(md, "en-US", "x")
    expect(html).toMatch(/<div class="tab-list" role="tablist"><button type="button" role="tab" id="(tabs-\w+)-0" aria-controls="\1-0-panel" aria-selected="true" tabindex="0">First<\/button><button [^>]*aria-selected="false" tabindex="-1">Second<\/button><\/div>/)
    expect(html).toMatch(/<div class="tab-panel" role="tabpanel" id="tabs-\w+-0-panel" aria-labelledby="tabs-\w+-0" data-title="First">\n<p>See <a href/)
    expect(html).toContain('class="language-js"')
    expect(html).toMatch(/data-title="Second" hidden>\n<div class="callout" data-callout="tip">/)
  })

  test("the same block gets the same ids on every build", () => {
    const a = run("```tabs\n--- A\nx\n```").md
    expect(run("```tabs\n--- A\nx\n```").md).toBe(a)
  })

  test("a deck keeps ```tabs as code", () => {
    expect(run("```tabs\n--- A\nx\n```", true).md).toBe("```tabs\n--- A\nx\n```")
  })
})

describe("columns", () => {
  test("Multi-Column Markdown regions become a grid, sized by their settings", async () => {
    const html = await render(
      "--- start-multi-column: A\n```column-settings\nNumber of Columns: 2\nColumn Size: [30%, 70%]\n```\nLeft [[Target]]\n--- column-break ---\nRight *x*\n--- end-multi-column\n\nAfter",
    )
    expect(html).toContain('<div class="columns" style="grid-template-columns:minmax(0, 30fr) minmax(0, 70fr)">\n<div class="column">\n<p>Left <a')
    expect(html).toContain('<div class="column">\n<p>Right <em>x</em></p>\n</div>\n</div>\n<p>After</p>')
    expect(html).not.toContain("Number of Columns")
  })

  test("without settings, there are as many columns as parts; === markers work too", () => {
    expect(columnsHtml("=== start-multi-column: B\na\n=== column-end ===\nb\n=== column-end ===\nc\n=== end-multi-column")).toContain(
      'style="grid-template-columns:repeat(3, minmax(0, 1fr))"',
    )
  })

  test("a region without its end is left alone", () => {
    expect(columnsHtml("--- start-multi-column: C\na")).toBe("--- start-multi-column: C\na")
  })

  test("sizes that are not lengths are ignored", () => {
    expect(columnsHtml("--- start-multi-column: D\n```column-settings\nColumn Size: [1px;color:red, 2px]\n```\na\n--- end-multi-column")).toContain(
      "repeat(1, minmax(0, 1fr))",
    )
  })
})
