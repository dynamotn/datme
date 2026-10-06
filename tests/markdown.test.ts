import { describe, expect, test } from "bun:test"
import { getVault } from "../src/lib/vault"
import { renderNote, renderSecret } from "../src/lib/markdown"

const vi = getVault().byKey["vi-VN"]
const zk = await renderNote(vi.get("03_Atomic/Zettelkasten")!)
const luhmann = await renderNote(vi.get("06_Reference/Niklas Luhmann")!)

describe("note rendering", () => {
  test("the leading H1 is hoisted out to become the page title", () => {
    expect(zk.h1).toBe("Zettelkasten")
    expect(zk.html).not.toContain("<h1")
  })

  test("headings get ids, anchors and feed the table of contents", () => {
    expect(zk.headings).toEqual([
      { depth: 2, id: "definition", text: "Definition" },
      { depth: 2, id: "related", text: "Related" },
    ])
    expect(zk.html).toContain('<h2 id="definition">')
    expect(zk.html).toContain('class="heading-anchor"')
  })

  test("callouts get a type, a title and fold into <details> with -", () => {
    expect(zk.html).toContain('<div class="callout" data-callout="info">')
    expect(zk.html).toContain('<div class="callout-title">Definition</div>')
    expect(zk.html).toMatch(/<details class="callout" data-callout="warning">\s*<summary class="callout-title">Folded caveat<\/summary>/)
  })

  test("highlights, block ids and inline tags survive the pipeline", () => {
    expect(zk.html).toContain("<mark>a network of notes</mark>")
    expect(zk.html).toContain('id="^core-idea"')
    expect(zk.html).toContain('class="tag-link"')
  })

  test("code is highlighted by Shiki and left untouched", () => {
    expect(zk.html).toContain('class="shiki shiki-themes github-light github-dark')
    expect(zk.html).toContain("[[not a link]]")
  })

  test("mermaid stays raw for the browser and math is typeset by KaTeX", () => {
    expect(zk.html).toContain('<pre class="mermaid">graph TD; A-->B</pre>')
    expect(zk.html).toContain('class="katex-display"')
  })

  test("comments never reach the output", () => {
    expect(zk.html).not.toContain("a private comment")
  })

  test("the description is the first paragraph, even inside a callout", () => {
    expect(zk.description).toBe("A note-taking method made famous by Niklas Luhmann.")
  })

  test("search text skips code blocks", () => {
    expect(zk.text).not.toContain("not a link")
    expect(zk.words).toBeGreaterThan(10)
  })
})

describe("links", () => {
  test("external links open in a new tab", () => {
    expect(luhmann.html).toContain('<a href="https://example.org" target="_blank" rel="noopener noreferrer" class="external">')
  })

  test("transclusion embeds the section up to the next heading of the same level", () => {
    expect(luhmann.html).toContain('<div class="transclude" data-url="/03_Atomic/Zettelkasten#definition">')
    expect(luhmann.html).toContain("a network of notes")
    expect(luhmann.html).toContain("Folded caveat")
    expect(luhmann.html).not.toContain("Missing note")
  })

  test("mutual embeds stop instead of recursing forever", async () => {
    const r = await renderNote(vi.get("index")!)
    expect(r.html.length).toBeGreaterThan(0)
  })
})

describe("caching", () => {
  test("rendering the same note twice reuses the result", async () => {
    const note = vi.get("06_Reference/Niklas Luhmann")!
    expect(renderNote(note)).toBe(renderNote(note))
  })
})

describe("readable text", () => {
  test("headings contribute their words without the # anchor", () => {
    expect(zk.text).toContain("Definition A slip box")
    expect(zk.text).not.toMatch(/Definition#/)
  })

  test("KaTeX's hidden MathML is not duplicated into the text", () => {
    expect(zk.text).not.toContain("e^{i\\pi}")
  })
})

describe("protected notes", () => {
  const secret = vi.get("06_Reference/Secret")!

  test("render as empty everywhere they could leak", async () => {
    const r = await renderNote(secret)
    expect(r).toEqual({ html: "", headings: [], text: "", words: 0, description: "" })
  })

  test("only renderSecret returns their content, for encryption", async () => {
    expect((await renderSecret(secret)).html).toContain("Protected content")
  })
})

describe("code blocks", () => {
  const code = renderNote(vi.get("03_Atomic/Code")!)

  test("title meta wraps the block in a captioned figure", async () => {
    const { html } = await code
    expect(html).toContain('<figure class="code-figure"><figcaption>app.ts</figcaption><pre')
    expect(html).toContain("<figcaption>tool.py</figcaption>")
  })

  test("meta ranges and notation comments mark lines", async () => {
    const { html } = await code
    expect(html).toMatch(/<span class="line highlighted">.*const<\/span><span[^>]*> b/)
    expect(html).toContain('class="line diff add"')
    expect(html).toContain('class="line focused"')
    expect(html).not.toContain("[!code")
  })
})

describe("dataview", () => {
  const queries = renderNote(vi.get("03_Atomic/Queries")!)

  test("queries render as tables of published notes", async () => {
    const { html } = await queries
    expect(html).toContain('<table class="dataview dv-table"><thead><tr><th>Ghi chú</th><th>Name</th></tr></thead>')
    expect(html).toContain('<a href="/06_Reference/Niklas-Luhmann" class="internal" data-key="06_Reference/Niklas Luhmann">Niklas Luhmann</a></td><td>Niklas Luhmann</td>')
  })

  test("queries never see unpublished or protected notes", async () => {
    const { html } = await queries
    expect(html).toContain("dv-empty")
    expect(html).not.toMatch(/Private|Secret/)
  })

  test("empty blocks render nothing", async () => {
    const { html } = await queries
    expect(html).not.toContain("dv-error")
  })

  test("GROUP BY and DataviewJS show a notice instead of code", async () => {
    const { html } = await queries
    expect(html).toContain("(GROUP BY)")
    expect(html).toContain("(DataviewJS)")
    expect(html).not.toContain("dv.list")
  })
})
