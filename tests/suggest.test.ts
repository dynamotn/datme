import { describe, expect, test } from "bun:test"
import { findMentions, formatSuggestions, prose, suggestionsFor } from "../src/lib/suggest"
import { parseArgs } from "../src/cli"

const slipBox = { file: "Notes/Slip box.md", title: "Slip box", names: ["Slip box", "Zettelkasten"] }

describe("prose", () => {
  test("blanks code, links, tags, comments and HTML, keeping every offset", () => {
    const src = "---\ntitle: Slip box\n---\nA `slip box` [[Slip box]] [slip box](x.md) #slipbox %%slip box%% <b title=\"slip box\">x</b> slip box"
    const out = prose(src)
    expect(out).toHaveLength(src.length)
    expect(out.match(/slip box/gi)).toEqual(["slip box"])
    expect(out.endsWith("slip box")).toBe(true)
  })
})

describe("findMentions", () => {
  test("the first unlinked mention of each note, whole words only, with its offset and line", () => {
    const src = "Intro.\nMy slipboxes and a Slip Box,\nthen a zettelkasten."
    expect(findMentions(src, [slipBox])).toEqual([{ file: "Notes/Slip box.md", title: "Slip box", text: "Slip Box", offset: 26, line: 2 }])
  })

  test("names under four letters are not looked for", () => {
    expect(findMentions("Use Git daily.", [{ file: "Git.md", title: "Git", names: ["Git"] }])).toEqual([])
  })

  test("a mention inside a link is no mention", () => {
    expect(findMentions("See [[Slip box|the slip box]].", [slipBox])).toEqual([])
  })
})

describe("datme related", () => {
  test("finds the published notes a note names without a link", async () => {
    const s = await suggestionsFor("01_Fleeting/01_Fleeting.md", "vi-VN")
    expect(s.published).toBe(true)
    const m = s.mentions.find((x) => x.file === "06_Reference/Niklas Luhmann.md")!
    expect(m.text).toBe("niklas luhmann")
    expect(m.line).toBe(4)
  })

  test("a private note gets related notes from its tags and links, and nothing private is suggested", async () => {
    const s = await suggestionsFor("06_Reference/Private.md", "vi-VN")
    expect(s.published).toBe(false)
    expect(s.related.concat(s.mentions as never[]).every((x) => !x.file.includes("Private"))).toBe(true)
  })

  test("a published note gets the related notes of its page", async () => {
    const s = await suggestionsFor("03_Atomic/Zettelkasten.md", "vi-VN")
    expect(s.related.find((r) => r.file === "03_Atomic/Code.md")?.tags).toEqual(["theme/pkm"])
    // Already linked: no mention suggested.
    expect(s.mentions.some((m) => m.file === "06_Reference/Niklas Luhmann.md")).toBe(false)
  })

  test("the report for people names the line of each mention", async () => {
    const text = formatSuggestions(await suggestionsFor("01_Fleeting/01_Fleeting.md", "vi-VN"))
    expect(text).toContain('line 4: "niklas luhmann" → [[Niklas Luhmann]]')
  })

  test("takes a note, like url", () => {
    expect(parseArgs(["related", "a.md", "--json"])).toMatchObject({ command: "related", note: "a.md", json: true })
    expect(() => parseArgs(["related"])).toThrow()
  })
})
