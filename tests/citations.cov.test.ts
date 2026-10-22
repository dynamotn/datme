import { describe, expect, test } from "bun:test"
import { cite, formatReference, latexText, parseBibtex, people, shortAuthors, type BibEntry } from "../src/lib/citations"

const entry = (key: string, fields: Record<string, string>, type = "article"): BibEntry => ({ key, type, fields })

describe("BibTeX edge cases", () => {
  test("LaTeX symbols and unknown accents", () => {
    expect(latexText("Stra\\ss e, \\o re, \\AE sop, \\l\\'odz")).toBe("Straße, øre, Æsop, łódz")
    expect(latexText("\\'q")).toBe("q")
    expect(latexText("1--2 \\% \\_x")).toBe("1–2 % _x")
  })

  test("# joins strings, macros and quoted parts; stray @ signs are skipped", () => {
    const src = [
      "an e-mail me@example.org is not an entry",
      '@string{pub = "Suhrkamp"}',
      "@string(place {Frankfurt})",
      "@comment{ignored}",
      '@preamble{"\\newcommand"}',
      '@book{k1, publisher = pub # ", " # place, title = "A {"quoted"} title", year = 1992}',
    ].join("\n")
    const [e] = parseBibtex(src)
    expect(e).toEqual({ key: "k1", type: "book", fields: { publisher: "Suhrkamp, Frankfurt", title: 'A "quoted" title', year: "1992" } })
  })

  test("malformed entries keep what parsed before the damage", () => {
    expect(parseBibtex("@misc{ , title = x}")).toEqual([])
    expect(parseBibtex("@misc{")).toEqual([])
    expect(parseBibtex("@misc{k2, title}")).toEqual([{ key: "k2", type: "misc", fields: {} }])
    expect(parseBibtex("@misc{k3, = oops}")).toEqual([{ key: "k3", type: "misc", fields: {} }])
    expect(parseBibtex("@misc{k4, title = {Open")).toEqual([{ key: "k4", type: "misc", fields: { title: "Open" } }])
  })
})

test("an entry without a key is skipped", () => {
  expect(parseBibtex("@misc{}")).toEqual([])
  expect(parseBibtex("@misc()")).toEqual([])
})

describe("formatting edge cases", () => {
  test("no names, single-word names and editors", () => {
    expect(people(undefined)).toEqual([])
    expect(people("Plato and  ")).toEqual([{ family: "Plato", given: "" }])
    expect(people("Kant,")).toEqual([{ family: "Kant", given: "" }])
    expect(shortAuthors(entry("e", { editor: "Ann Smith and Bob Jones" }))).toBe("Smith & Jones")
    expect(shortAuthors(entry("e", { title: "Beowulf" }))).toBe("Beowulf")
    expect(shortAuthors(entry("e", {}))).toBe("e")
  })

  test("anonymous works, dates instead of years, books in collections and plain URLs", () => {
    expect(formatReference(entry("a", { title: "Beowulf" }))).toBe("Beowulf (n.d.).")
    expect(
      formatReference(
        entry("b", { author: "Plato", title: "Republic", date: "2001-05-01", booktitle: "Dialogues", volume: "4", url: "https://example.org/r" }),
      ),
    ).toBe('Plato (2001). Republic. <em>Dialogues</em>, <em>4</em>. <a href="https://example.org/r">https://example.org/r</a>')
    expect(formatReference(entry("c", { author: "Jean-Luc Picard", url: "ftp://nope" }))).toBe("Picard, J. L. (n.d.).")
    expect(formatReference(entry("d", { author: "X", doi: "https://dx.doi.org/10.1/abc" }))).toBe(
      'X (n.d.). <a href="https://doi.org/10.1/abc">https://doi.org/10.1/abc</a>',
    )
  })

  test("a citation mixing a missing key keeps both, and a list with a non-citation stays text", () => {
    const bib = new Map([["k", entry("k", { author: "A", year: "2000" })]])
    expect(cite("[@k; @gone; @gone]", bib, "Refs").missing).toEqual(["gone"])
    expect(cite("[@k; not one]", bib, "Refs").md).toBe("[@k; not one]")
    expect(cite("[@k]: https://x", bib, "Refs").md).toBe("[@k]: https://x")
    expect(cite("~~~\n[@k]\n~~~\n[@k]", bib, "Refs").md).toStartWith(
      '~~~\n[@k]\n~~~\n<cite class="citations">(<a href="#ref-k" class="citation">A 2000</a>)</cite>',
    )
  })
})
