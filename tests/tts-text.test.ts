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
    expect(spokenChunks("- one\n- two!\n1. three\n- [ ] four\n\n---\n\n> quoted")).toEqual(["one. two! three. four.", "quoted"])
  })

  test("a long paragraph splits at sentence ends within maxChars", () => {
    const chunks = spokenChunks("Alpha one. Beta two! Gamma three? Delta four… Epsilon five.", 25)
    expect(chunks).toEqual(["Alpha one. Beta two!", "Gamma three? Delta four…", "Epsilon five."])
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(25)
  })

  test("a sentence longer than maxChars breaks at a comma, else between words", () => {
    expect(spokenChunks("First part, second part here. Short.", 20)).toEqual(["First part,", "second part here.", "Short."])
    const chunks = spokenChunks("one two three four five six seven eight nine ten", 12)
    expect(chunks.join(" ")).toBe("one two three four five six seven eight nine ten")
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(12)
  })

  test("a word longer than maxChars is cut, not dropped", () => {
    expect(spokenChunks("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"])
  })

  test("CJK sentence ends split like Latin ones", () => {
    expect(spokenChunks("第一句。第二句！第三句？", 5)).toEqual(["第一句。", "第二句！", "第三句？"])
  })

  test("bare URLs, HTML tags, tags and block ids are not spoken", () => {
    expect(spokenChunks("See https://x.y/a?b=1 now. <span class=\"k\">Word</span><br> #topic/sub end #1 ^block-1")).toEqual(["See now. Word end #1"])
  })

  test("HTML with URLs inside, autolinks, linked images and inline footnotes leave nothing behind", () => {
    expect(spokenChunks('<iframe src="https://y.t/e/x"></iframe> one <https://x.dev> two [![badge](x.svg)](https://x) three^[a note] four.')).toEqual([
      "one two three four.",
    ])
  })

  test("indented code and setext underlines are not spoken; escapes lose their backslash", () => {
    expect(spokenChunks("Title\n===\n\nPara.\n\n    code()\n\nAfter \\*star\\* and \\#hash.")).toEqual(["Title", "Para.", "After star and #hash."])
  })

  test("a decimal point does not end a sentence", () => {
    expect(spokenChunks("Giá là 3.14 triệu đồng. Xong rồi.", 25)).toEqual(["Giá là 3.14 triệu đồng.", "Xong rồi."])
  })

  test("math is not spoken", () => {
    expect(spokenChunks("Energy $E=mc^2$ here, $5 and $6.\n\n$$\n\\int x\n$$\n\nAfter.")).toEqual(["Energy here, $5 and $6.", "After."])
  })

  test("tables are read row by row, without pipes or the separator", () => {
    expect(spokenChunks("| A | B |\n| :-- | --: |\n| one | two |")).toEqual(["A, B", "one, two"])
  })

  test("a link to a heading reads the note and heading", () => {
    expect(spokenChunks("[[Note#Part]] and [[#Own]]")).toEqual(["Note Part and Own"])
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
