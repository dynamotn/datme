import { describe, expect, test } from "bun:test"
import { noteProperties, toProp } from "../src/lib/properties"
import { getVault, type Note } from "../src/lib/vault"

const none = () => undefined

describe("toProp without a resolver for private notes", () => {
  test("an unresolved wikilink keeps its alias or its target as text", () => {
    expect(toProp("[[Nowhere|somewhere]]", none)).toEqual({ kind: "text", text: "somewhere", href: undefined })
    expect(toProp("[[Nowhere#Part]]", none)).toEqual({ kind: "text", text: "Nowhere", href: undefined })
  })

  test("a private note's words replace the link; none at all drop the value", () => {
    expect(toProp("[[Diary]]", none, () => "a private note")).toEqual({ kind: "text", text: "a private note" })
    expect(toProp("[[Diary]]", none, () => "")).toBeUndefined()
  })

  test("maps and lists of links resolve each value", () => {
    expect(toProp({ who: ["[[A|Ann]]", ""], empty: [] }, none)).toEqual({
      kind: "map",
      entries: [["who", { kind: "list", items: [{ kind: "text", text: "Ann", href: undefined }] }]],
    })
  })

  test("mailto and web links keep their address", () => {
    expect(toProp(" mailto:me@example.com ", none)).toEqual({ kind: "text", text: "me@example.com", href: "mailto:me@example.com" })
    expect(toProp("https://example.com", none)).toEqual({ kind: "text", text: "https://example.com", href: "https://example.com" })
    expect(toProp("   ", none)).toBeUndefined()
    expect(toProp(null, none)).toBeUndefined()
  })
})

describe("noteProperties", () => {
  const vault = getVault()
  const any = vault.notes["en-US"].find((n) => !n.protected)!

  const fake = (patch: Partial<Note>, fm: Record<string, unknown>): Note => ({ ...any, ...patch, source: { ...any.source, fm } })

  test("a protected note shows none", () => {
    expect(noteProperties(fake({ protected: true }, { colour: "red" }))).toEqual([])
  })

  test("aliases come first; layout fields of a collection or a résumé are hidden", () => {
    const fm = { colour: "red", aliases: ["Other"], from: "#tag", role: "Gardener", email: "me@example.com" }
    expect(noteProperties(fake({ layout: "books", protected: false, slides: undefined }, fm)).map(([k]) => k)).toEqual(["aliases", "colour", "role", "email"])
    expect(noteProperties(fake({ layout: "cv", protected: false, slides: undefined }, fm)).map(([k]) => k)).toEqual(["aliases", "colour", "from"])
  })

  test("a deck's directives and a stage shown as a chip are hidden", () => {
    const fm = { marp: true, theme: "gaia", paginate: true, stage: "fleeting", colour: "red" }
    const props = noteProperties(fake({ slides: { theme: "gaia" }, stage: "fleeting", layout: undefined, protected: false }, fm))
    expect(props.map(([k]) => k)).toEqual(["colour"])
  })

  test("a wikilink to a published note links to it", () => {
    const target = vault.notes["en-US"].find((n) => n.key !== any.key && !n.isHome)!
    const props = noteProperties(fake({ slides: undefined, layout: undefined, protected: false }, { related: `[[${target.source.stem}]]` }))
    expect(props).toEqual([["related", { kind: "text", text: target.title, href: target.url }]])
  })

  test("a wikilink to a note that is in no vault stays its words, unlinked", () => {
    const props = noteProperties(fake({ slides: undefined, layout: undefined, protected: false }, { related: "[[Nothing of the kind|that]]" }))
    expect(props).toEqual([["related", { kind: "text", text: "that", href: undefined }]])
  })
})
