import { describe, expect, test } from "bun:test"
import { getVault } from "../src/lib/vault"
import { renderNote, renderSecret, renderMarkdown } from "../src/lib/markdown"

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

  test("blocks of several lines get a line-number gutter sized to their count", async () => {
    const { html } = await code
    expect(html).toMatch(/<pre class="shiki shiki-themes [^"]* line-numbers"[^>]*style="[^"]*;--ln-digits:1"[^>]*><code class="language-ts"/)
    const long = await renderMarkdown("```\n" + Array.from({ length: 12 }, (_, i) => `l${i}`).join("\n") + "\n```", "en-US", "x")
    expect(long).toContain("--ln-digits:2")
  })

  test("a one-line block has no gutter", async () => {
    const { html } = await code
    expect(html).toMatch(/<pre class="shiki shiki-themes [^"]*"(?![^>]*line-numbers)[^>]*><code class="language-py"/)
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

  test("plain footnotes are copied next to their reference as sidenotes", async () => {
    const html = await renderMarkdown("Text[^1] and more[^2].\n\n[^1]: First *note*.\n[^2]: Second.", "en-US", "x")
    expect(html).toContain(
      '<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup><span class="sidenote" role="note"><span class="sidenote-number">1</span> First <em>note</em>.</span>',
    )
    expect(html).toContain('<section data-footnotes="" class="footnotes">')
    expect(html.match(/class="sidenote"/g)).toHaveLength(2)
  })

  test("footnotes holding a list keep only the footnotes section", async () => {
    const html = await renderMarkdown("Text[^1] and[^2].\n\n[^1]: Plain.\n[^2]: Has a list:\n\n    - one\n    - two", "en-US", "x")
    expect(html).not.toContain('class="sidenote"')
  })

  test("GROUP BY renders one row per group", async () => {
    const { html } = await queries
    expect(html).toMatch(/<th>file.folder<\/th><th>rows.file.link<\/th>/)
    expect(html).toContain("<td>03_Atomic</td>")
  })

  test("TASK lists the tasks of each note as checkboxes, with their links rendered", async () => {
    const { html } = await queries
    expect(html).toContain('<div class="dataview dv-tasks">')
    expect(html).toMatch(/<li class="task-list-item"><input type="checkbox" disabled> Ask <a href="\/06_Reference\/Niklas-Luhmann"/)
    expect(html).toMatch(/<input type="checkbox" checked disabled> <strong>Read<\/strong> the paper/)
  })

  test("a tasks block lists the open tasks, each with a link to its note", async () => {
    const { html } = await queries
    const block = html.match(/<div class="dataview dv-tasks tasks-query">[\s\S]*?<\/div>/)![0]
    expect(block).toMatch(/<input type="checkbox" disabled> Ask <a href="\/06_Reference\/Niklas-Luhmann"[^>]*>Niklas Luhmann<\/a> about it <a class="task-note internal" href="\/03_Atomic\/Queries">Queries<\/a>/)
    expect(block).not.toContain("Read")
  })

  test("a query block lists matching published notes with the line that matched", async () => {
    const { html } = await queries
    const block = html.match(/<ul class="dataview query-results">[\s\S]*?<\/ul>/)![0]
    expect(block).toContain('<a class="internal" href="/03_Atomic/Zettelkasten" data-key="03_Atomic/Zettelkasten">Zettelkasten</a>')
    expect(block).toMatch(/<p class="query-snippet">.*<mark>slip box<\/mark>/)
    expect(block).not.toMatch(/Private|Secret/)
  })

  test("DataviewJS shows a notice instead of code", async () => {
    const { html } = await queries
    expect(html).toContain("(DataviewJS)")
    expect(html).not.toContain("dv.list")
  })
})

describe("line breaks", () => {
  test("poems keep their single line breaks", async () => {
    const { html } = await renderNote(vi.get("07_Project/Poem")!)
    expect(html).toContain("Plain stanza<br>\ngoes on here")
    expect(html).toContain("second line<br>\nthird line")
  })

  test("a line already ending in </br> gets no second break", async () => {
    const { html } = await renderNote(vi.get("07_Project/Poem")!)
    expect(html).not.toMatch(/First line<\/br>\s*<br>/)
    expect(html).not.toMatch(/First line<br>\s*<br>/)
  })

  test("other notes keep markdown's soft breaks", async () => {
    const { html } = await renderNote(vi.get("03_Atomic/Zettelkasten")!)
    expect(html).not.toContain("<br>")
  })
})
