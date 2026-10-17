import { describe, expect, test } from "bun:test"
import { locate, makeHighlight, toMarkdown } from "../src/scripts/highlights"

describe("reader highlights", () => {
  const text = "A note links to a note. Every note links to another note, and the links grow."

  test("a highlight keeps its words and a little of the text around them", () => {
    const at = text.indexOf("links to another")
    const h = makeHighlight(text, at, at + "links to another".length, 1)
    expect(h.text).toBe("links to another")
    expect(h.prefix.endsWith("Every note ")).toBe(true)
    expect(h.suffix.startsWith(" note, and")).toBe(true)
  })

  test("repeated words find the place they were taken from", () => {
    const second = text.indexOf("note", text.indexOf("Every"))
    const h = makeHighlight(text, second, second + 4, 1)
    expect(locate(text, h)).toBe(second)
  })

  test("after the author edits around it, the highlight still finds its words", () => {
    const at = text.indexOf("links to another")
    const h = makeHighlight(text, at, at + 16, 1)
    const edited = "Intro added. " + text.replace("Every note", "Each and every note")
    expect(edited.slice(locate(edited, h), locate(edited, h) + 16)).toBe("links to another")
  })

  test("words that are gone are lost", () => {
    expect(locate("Rewritten entirely.", makeHighlight(text, 0, 6, 1))).toBe(-1)
  })

  test("the export quotes each passage, adds the reader's words and links back to the passage", () => {
    const md = toMarkdown(
      [{ url: "https://g.dev/Notes/Zettel", page: { title: "Zettel", items: [{ ...makeHighlight(text, 0, 6, 2), note: "Start here." }, { ...makeHighlight(text, 24, 34, 1), note: "" }] } }],
      "My highlights · Garden",
      "lost",
      (_url, h) => h.text !== "Every note",
    )
    expect(md).toBe(
      [
        "# My highlights · Garden",
        "",
        "## [Zettel](https://g.dev/Notes/Zettel)",
        "",
        "> Every note",
        ">",
        "> [↗](https://g.dev/Notes/Zettel#:~:text=Every%20note) (lost)",
        "",
        "> A note",
        ">",
        "> [↗](https://g.dev/Notes/Zettel#:~:text=A%20note)",
        "",
        "Start here.",
        "",
      ].join("\n"),
    )
  })
})
