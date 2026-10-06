import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { localContent } from "../src/scripts/popover"

const happy = new Window({ url: "https://garden.example/note" })
const window = happy as unknown as globalThis.Window & typeof globalThis
const document = window.document

describe("local popovers", () => {
  document.body.innerHTML = `<div class="prose">
    <p>Text<sup><a href="#user-content-fn-1" id="r1" data-footnote-ref>1</a></sup> as said <a class="citation" href="#ref-luhmann1992">Luhmann 1992</a>.</p>
    <section class="footnotes"><ol><li id="user-content-fn-1"><p>A <em>footnote</em>. <a href="#r1" data-footnote-backref class="data-footnote-backref">↩</a></p></li></ol></section>
    <section class="references"><ol><li id="ref-luhmann1992">Luhmann, N. (1992). <em>Die Wissenschaft</em>.</li></ol></section>
  </div>`
  const link = (sel: string) => document.querySelector<HTMLAnchorElement>(sel)!

  test("a footnote reference shows the footnote without its back link", () => {
    const html = localContent(link("[data-footnote-ref]"), document)!.innerHTML
    expect(html).toContain("A <em>footnote</em>.")
    expect(html).not.toContain("↩")
    expect(html).not.toContain(" id=")
  })

  test("a citation shows its full reference", () => {
    expect(localContent(link("a.citation"), document)!.innerHTML).toBe("Luhmann, N. (1992). <em>Die Wissenschaft</em>.")
  })

  test("a link to nothing on the page shows nothing", () => {
    const a = document.createElement("a")
    a.href = "#nowhere"
    expect(localContent(a, document)).toBeUndefined()
  })
})
