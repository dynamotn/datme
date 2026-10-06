import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { cite, formatReference, latexText, parseBibtex, people, shortAuthors } from "../src/lib/citations"
import { getVault } from "../src/lib/vault"

const entries = parseBibtex(fs.readFileSync(path.join(import.meta.dir, "fixtures/vault/_assets/refs.bib"), "utf8"))
const bib = new Map(entries.map((e) => [e.key, e]))

describe("BibTeX", () => {
  test("entries, braced and quoted values, numbers and @string macros", () => {
    expect(entries.map((e) => e.key)).toEqual(["luhmann1992", "ahrens2017"])
    expect(bib.get("luhmann1992")!.fields).toMatchObject({ year: "1992", publisher: "Suhrkamp", title: "Die Wissenschaft der Gesellschaft" })
    expect(bib.get("ahrens2017")!.fields).toMatchObject({ journal: "Journal of Note Taking", pages: "10–20" })
  })

  test("LaTeX accents and escapes become plain text", () => {
    expect(latexText('S{\\"o}nke M\\"uller \\& {\\\'E}mile')).toBe("Sönke Müller & Émile")
  })

  test("names in either order", () => {
    expect(people("Luhmann, Niklas and Jürgen Habermas")).toEqual([
      { family: "Luhmann", given: "Niklas" },
      { family: "Habermas", given: "Jürgen" },
    ])
    expect(shortAuthors(bib.get("ahrens2017")!)).toBe("Ahrens et al.")
  })

  test("references in an APA-like style, with the DOI as a link", () => {
    expect(formatReference(bib.get("luhmann1992")!)).toBe("Luhmann, N. (1992). <em>Die Wissenschaft der Gesellschaft</em>. Suhrkamp.")
    expect(formatReference(bib.get("ahrens2017")!)).toBe(
      'Ahrens, S., Doe, J., &amp; Roe, J. (2017). How to Take Smart Notes. <em>Journal of Note Taking</em>, <em>3</em>(2), 10–20. <a href="https://doi.org/10.1000/xyz123">https://doi.org/10.1000/xyz123</a>',
    )
  })
})

describe("cite", () => {
  test("bracketed citations become author–date links, with the references appended", () => {
    const { md, keys } = cite("As shown [see @luhmann1992, p. 53; -@ahrens2017].", bib, "References")
    expect(md).toContain(
      '(see <a href="#ref-luhmann1992" class="citation">Luhmann 1992, p. 53</a>; <a href="#ref-ahrens2017" class="citation">2017</a>)',
    )
    expect(keys).toEqual(["luhmann1992", "ahrens2017"])
    expect(md).toMatch(/<h2 id="cited-references">References<\/h2><ol><li id="ref-ahrens2017">Ahrens.*<li id="ref-luhmann1992">/)
  })

  test("unknown keys are marked and reported", () => {
    const { md, missing } = cite("[@nobody2020]", bib, "References")
    expect(md).toContain('<span class="citation-missing">@nobody2020</span>')
    expect(missing).toEqual(["nobody2020"])
  })

  test("links, e-mails, wikilinks and code are not citations", () => {
    for (const src of ["[mail](mailto:me@x.org)", "[me@x.org]", "[[Note]]", "`[@luhmann1992]`", "```\n[@luhmann1992]\n```"]) {
      expect(cite(src, bib, "References").md).toBe(src)
    }
  })
})

describe("in the vault", () => {
  test("a note citing the bibliography lists its references; a missing key is a problem", () => {
    const vault = getVault()
    const note = vault.byKey["en-US"].get("07_Project/Blog post")!
    expect(note.md).toContain('<a href="#ref-luhmann1992" class="citation">Luhmann 1992, p. 53</a>')
    expect(note.md).toContain('<h2 id="cited-references">References</h2>')
    expect(vault.byKey["vi-VN"].get("07_Project/Blog post")!.md).toContain(">Tài liệu tham khảo</h2>")
    expect(vault.problems).toContainEqual({
      level: "error",
      file: "07_Project/Blog post.md",
      message: "citation @missing2000 is not in the bibliography",
    })
  })
})
