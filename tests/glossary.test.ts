import { describe, expect, test } from "bun:test"
import { glossary } from "../src/lib/glossary"
import { renderNote, renderMarkdown } from "../src/lib/markdown"
import { getVault } from "../src/lib/vault"

describe("glossary", () => {
  test("notes tagged type/term are terms, under their title and aliases", () => {
    const { terms } = glossary("vi-VN")
    expect(terms).toEqual([{ key: "03_Atomic/Zettelkasten", url: "/03_Atomic/Zettelkasten", names: ["Zettelkasten", "Slip box"] }])
  })

  test("the first mention links to the term, whole words and any case; later ones stay text", async () => {
    const html = await renderMarkdown("A slip box, another slip box, and slipboxes.", "vi-VN", "x")
    expect(html).toBe(
      '<p>A <a href="/03_Atomic/Zettelkasten" class="internal term" data-key="03_Atomic/Zettelkasten">slip box</a>, another slip box, and slipboxes.</p>',
    )
  })

  test("links, code and headings are left alone, and a term never links to itself", async () => {
    const html = await renderMarkdown("## Zettelkasten\n\n`Zettelkasten` [Zettelkasten](https://x.example)", "vi-VN", "x")
    expect(html).not.toContain('class="internal term"')
    const own = await renderNote(getVault().byKey["vi-VN"].get("03_Atomic/Zettelkasten")!)
    expect(own.html).not.toContain('class="internal term"')
  })
})
