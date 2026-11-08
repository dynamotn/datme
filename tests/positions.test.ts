import { beforeAll, describe, expect, test } from "bun:test"
import { probeVault } from "./vault-probe"
import { citationPlaces, linkPlaces, placeOf, propertyPlace, yamlErrorPlace } from "../src/lib/positions"

const note = [
  "﻿---",
  "title: X",
  "aliases:",
  "  - Foo",
  "  - Bar",
  "layout: poemz",
  "speakers:",
  "  Ann: a.png",
  "",
  "  Bob:",
  "    - b.png",
  'up: "[[Gone]]"',
  "empty:",
  "---",
  "See [[Gone]] and [[Gone|g]] `[[Gone]]` ![[Gone]]",
  "```",
  "[[Gone]]",
  "```",
  "%% [[Gone]] %%",
  "[x](Gone%20Two.md) [y](<Gone Two.md#h>) [z](%E0%A4%A.md) [[a/Gone#h]] [[Gone\\|t]]",
  "[see @k1; -@k2, p. 3] @k1 [@k1x] [me@k1]",
].join("\n")

describe("placeOf", () => {
  test("counts lines and columns from 1, the end just past the last character", () => {
    expect(placeOf("ab\ncd", 3, 5)).toEqual({ line: 2, column: 1, endLine: 2, endColumn: 3 })
  })
})

describe("linkPlaces", () => {
  test("finds each time a note writes a link, outside frontmatter, code and comments", () => {
    expect(linkPlaces(note, "link", "Gone")).toEqual([
      { line: 15, column: 5, endLine: 15, endColumn: 13 },
      { line: 15, column: 18, endLine: 15, endColumn: 28 },
      { line: 20, column: 71, endLine: 20, endColumn: 82 },
    ])
  })

  test("tells embeds from links", () => {
    expect(linkPlaces(note, "embed", "Gone")).toEqual([{ line: 15, column: 40, endLine: 15, endColumn: 49 }])
    expect(linkPlaces(note, "drawing", "Gone")).toHaveLength(1)
  })

  test("reads markdown links as the converter does, decoded and without their fragment", () => {
    expect(linkPlaces(note, "link", "Gone Two.md").map((p) => p.column)).toEqual([1, 20])
    expect(linkPlaces(note, "link", "%E0%A4%A.md")).toHaveLength(1)
    expect(linkPlaces(note, "link", "/a/Gone")).toHaveLength(1)
  })

  test("reads the markdown of a tabs block, not the code inside it", () => {
    const tabs = "```tabs\n--- One\n[[Gone]]\n```js\n[[Gone]]\n```\n```"
    expect(linkPlaces(tabs, "link", "Gone")).toEqual([{ line: 3, column: 1, endLine: 3, endColumn: 9 }])
  })

  test("finds nothing the note does not write", () => {
    expect(linkPlaces("no links", "link", "Gone")).toEqual([])
  })
})

describe("citationPlaces", () => {
  test("finds each bracketed citation of a key, and nothing else", () => {
    expect(citationPlaces(note, "k1")).toEqual([{ line: 21, column: 6, endLine: 21, endColumn: 9 }])
    expect(citationPlaces(note, "k2")).toEqual([{ line: 21, column: 12, endLine: 21, endColumn: 15 }])
  })
})

describe("propertyPlace", () => {
  test("points at a property's value", () => {
    expect(propertyPlace(note, ["layout"])).toEqual({ line: 6, column: 9, endLine: 6, endColumn: 14 })
    expect(propertyPlace(note, ["speakers", "Ann"])).toEqual({ line: 8, column: 8, endLine: 8, endColumn: 13 })
  })

  test("points at an item of a list", () => {
    expect(propertyPlace(note, ["aliases"], "Bar")).toEqual({ line: 5, column: 5, endLine: 5, endColumn: 8 })
    expect(propertyPlace(note, ["speakers", "Bob"], "b.png")).toEqual({ line: 11, column: 7, endLine: 11, endColumn: 12 })
    expect(propertyPlace("---\naliases: Foo, Bar\n---\n", ["aliases"], "Bar")).toEqual({ line: 2, column: 15, endLine: 2, endColumn: 18 })
  })

  test("points at the key when its value is not on its line, or the item is not found", () => {
    expect(propertyPlace(note, ["speakers"])).toEqual({ line: 7, column: 1, endLine: 7, endColumn: 9 })
    expect(propertyPlace(note, ["empty"], "x")).toEqual({ line: 13, column: 1, endLine: 13, endColumn: 6 })
  })

  test("finds no place for a key the frontmatter does not have", () => {
    expect(propertyPlace(note, ["nope"])).toBeUndefined()
    expect(propertyPlace(note, ["speakers", "Cy"])).toBeUndefined()
    expect(propertyPlace(note, ["Ann"])).toBeUndefined()
    expect(propertyPlace("no frontmatter", ["layout"])).toBeUndefined()
  })
})

describe("yamlErrorPlace", () => {
  test("points where the YAML stops making sense, counting the opening line", () => {
    expect(yamlErrorPlace("---\na: 1\nb: [\n---\n")).toEqual({ line: 3, column: 5 })
  })

  test("finds none in valid YAML or without frontmatter", () => {
    expect(yamlErrorPlace(note)).toBeUndefined()
    expect(yamlErrorPlace("text")).toBeUndefined()
  })
})

describe("in the vault", () => {
  let problems: { file: string; message: string; line?: number; column?: number }[]
  beforeAll(() => {
    problems = probeVault(
      {
        "Note.md": "---\npublish: true\nlayout: nope\nstyle: nope\nchrome: nope\naliases: [Other]\n---\n[[Gone]] and\n\nagain [[Gone]], `[[Gone]]`\n",
        "Other.md": "---\npublish: true\n---\n",
      },
      `import { checkVault } from "$src/lib/check"
console.log(JSON.stringify(checkVault()))`,
    ).result
  }, 60_000)

  const at = (needle: string) => problems.filter((p) => p.message.includes(needle)).map((p) => `${p.file}:${p.line}:${p.column}`)

  test("each time a note writes a broken link is a problem of its own", () => {
    expect(at("missing note")).toEqual(["Note.md:8:1", "Note.md:10:7"])
  })

  test("a frontmatter value the note cannot use points at the value", () => {
    expect(at("layout")).toEqual(["Note.md:3:9"])
    expect(at("style")).toEqual(["Note.md:4:8"])
    expect(at("chrome")).toEqual(["Note.md:5:9"])
    expect(at("ambiguous")).toEqual(["Note.md:6:11"])
  })
})
