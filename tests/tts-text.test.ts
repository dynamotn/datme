import { describe, expect, test } from "bun:test"
import { spokenChunks, noteChunks } from "../src/lib/tts-text"
import { getVault } from "../src/lib/vault"

describe("spokenChunks", () => {
  test("fenced code of any language is not read", () => {
    for (const lang of ["ts", "mermaid", "d2", "dataview", ""]) {
      expect(spokenChunks(`Before.\n\n\`\`\`${lang}\ncode here\n\`\`\`\n\nAfter.`)).toEqual(["Before.", "After."])
    }
    expect(spokenChunks("~~~\nx\n~~~")).toEqual([])
  })

  test("code fenced inside a callout is not read", () => {
    expect(spokenChunks("> [!tip] T\n> ```js\n> x()\n> ```\n> After.")).toEqual(["T", "After."])
  })

  test("markdown that is only a code block gives nothing", () => {
    expect(spokenChunks("```js\nconsole.log(1)\n```\n")).toEqual([])
  })

  test("headings keep their words and stay apart from paragraphs", () => {
    expect(spokenChunks("Intro line\n## Heading\nBody line")).toEqual(["Intro line", "Heading", "Body line"])
  })

  test("callouts keep title and body without the quote marker", () => {
    expect(spokenChunks("> [!note] Title\n> Body of the callout.\n> More.")).toEqual(["Title", "Body of the callout. More."])
  })

  test("embeds, images and footnotes are dropped", () => {
    const md = "Text![[img.png]] here ![alt](x.png)and[^1] more.\n\n[^1]: The note."
    expect(spokenChunks(md)).toEqual(["Text here and more."])
  })

  test("links and emphasis lose their markup", () => {
    expect(spokenChunks("[[Note|words]] and [[Note]] and [text](https://x.y) **b** _i_ `c` *d* ~~e~~ ==f==")).toEqual([
      "words and Note and text b i c d e f",
    ])
  })

  test("list markers, quotes and rules are not spoken", () => {
    expect(spokenChunks("- one\n- two\n1. three\n- [ ] four\n\n---\n\n> quoted")).toEqual(["one two three four", "quoted"])
  })

  test("a long paragraph splits at sentence ends within maxChars", () => {
    const chunks = spokenChunks("Alpha one. Beta two! Gamma three? Delta four… Epsilon five.", 25)
    expect(chunks).toEqual(["Alpha one. Beta two!", "Gamma three? Delta four…", "Epsilon five."])
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(25)
  })

  test("a single sentence longer than maxChars stays whole", () => {
    expect(spokenChunks("One very long sentence without any end. Short.", 10)).toEqual(["One very long sentence without any end.", "Short."])
  })

  test("a short paragraph is one chunk even when packing would fit more", () => {
    expect(spokenChunks("A.\n\nB.")).toEqual(["A.", "B."])
  })

  test("text without a final stop is kept", () => {
    expect(spokenChunks("Go on. And on", 8)).toEqual(["Go on.", "And on"])
  })
})

describe("noteChunks", () => {
  test("reads the unlocked text of a note and none of the locked", () => {
    const note = getVault().byKey["vi-VN"].get("07_Project/Blog post")!
    const text = noteChunks(note).join(" ")
    expect(text).toContain("First paragraph of the blog post")
    expect(text).toContain("After the door.")
    expect(text).not.toContain("hidden treasure")
    expect(text).not.toContain("group secret")
  })
})
