import { describe, expect, test } from "bun:test"
import { renderMarkdown } from "../src/lib/markdown"
import { colorTriplet } from "../src/lib/admonition"

const render = (md: string) => renderMarkdown(md, "en-US", "x")

describe("Admonition plugin blocks", () => {
  test("title and collapse map onto a foldable callout", async () => {
    const html = await render("```ad-warning\ntitle: Careful\ncollapse: open\nSome *text*\n```")
    expect(html).toMatch(/<details class="callout" data-callout="warning" open[^>]*>\s*<summary class="callout-title">Careful<\/summary>/)
    expect(html).toContain("Some <em>text</em>")
  })

  test("collapse closed folds it, no collapse or none does not", async () => {
    expect(await render("```ad-note\ncollapse: closed\nx\n```")).toMatch(/<details class="callout" data-callout="note">\s*<summary class="callout-title">Note</)
    expect(await render("```ad-note\ncollapse: none\nx\n```")).toContain('<div class="callout" data-callout="note">')
    expect(await render("```ad-tip\nx\n```")).toContain('<div class="callout-title">Tip</div>')
  })

  test("an unknown type is a note, an alias keeps its callout alias", async () => {
    expect(await render("```ad-nonsense\nx\n```")).toContain('data-callout="note"')
    expect(await render("```ad-caution\nx\n```")).toContain('data-callout="warning"')
  })

  test("the body is Markdown: links, lists and code work", async () => {
    const html = await render("```ad-info\n- one\n- [two](https://example.org)\n\n```js\nlet a = 1\n```\n```")
    expect(html).toContain("<li>one</li>")
    expect(html).toContain('href="https://example.org"')
    expect(html).toContain("shiki")
  })

  test("admonitions nest with longer fences or tildes", async () => {
    const html = await render("````ad-note\ntitle: Outer\n```ad-bug\ntitle: Inner\nbody\n```\n````")
    expect(html.match(/class="callout"/g)).toHaveLength(2)
    expect(html).toContain('data-callout="bug"')
    const tilde = await render("~~~ad-note\n~~~ad-tip\nin\n~~~\n~~~\n")
    expect(tilde.match(/class="callout"/g)).toHaveLength(2)
  })

  test("color becomes a validated --c triplet; icon and invalid colors are ignored", async () => {
    expect(await render("```ad-note\ncolor: #ff8000\nicon: flame\nx\n```")).toContain('style="--c: 255 128 0"')
    expect(await render("```ad-note\ncolor: 10, 20, 30\nx\n```")).toContain("--c: 10 20 30")
    const bad = await render("```ad-note\ncolor: red;background:url(x)\nx\n```")
    expect(bad).not.toContain("style=")
  })

  test("an empty block and plain code blocks are left alone", async () => {
    expect(await render("```ad-note\n```")).toContain('data-callout="note"')
    expect(await render("```js\nx\n```")).not.toContain("callout")
  })

  test("colorTriplet", () => {
    expect(colorTriplet("#fff")).toBe("255 255 255")
    expect(colorTriplet("300,0,0")).toBeUndefined()
    expect(colorTriplet("red")).toBeUndefined()
  })
})
