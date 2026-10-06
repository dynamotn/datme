import { describe, expect, test } from "bun:test"
import { toProp, noteProperties } from "../src/lib/properties"
import { getVault } from "../src/lib/vault"

const none = () => undefined

describe("toProp", () => {
  test("empty values, lists and maps disappear", () => {
    expect(toProp("", none)).toBeUndefined()
    expect(toProp([""], none)).toBeUndefined()
    expect(toProp({ phone: [""], mail: "" }, none)).toBeUndefined()
  })

  test("nested maps keep only filled fields", () => {
    expect(toProp({ fullname: "A", nickname: [""], gender: 0 }, none)).toEqual({
      kind: "map",
      entries: [
        ["fullname", { kind: "text", text: "A" }],
        ["gender", { kind: "text", text: "0" }],
      ],
    })
  })

  test("URLs and mail addresses become links", () => {
    expect(toProp("https://x.example", none)).toEqual({ kind: "text", text: "https://x.example", href: "https://x.example" })
    expect(toProp("mailto:me@x.example", none)).toEqual({ kind: "text", text: "me@x.example", href: "mailto:me@x.example" })
  })

  test("unresolved wikilinks stay as plain text", () => {
    expect(toProp("[[Nowhere]]", none)).toEqual({ kind: "text", text: "Nowhere", href: undefined })
  })
})

describe("noteProperties", () => {
  const vi = getVault().byKey["vi-VN"]

  test("lists aliases first and hides bookkeeping keys", () => {
    const keys = noteProperties(vi.get("06_Reference/Niklas Luhmann")!).map(([k]) => k)
    expect(keys).toEqual(["person", "related", "website", "start", "end", "location"])
    expect(noteProperties(vi.get("03_Atomic/Zettelkasten")!).map(([k]) => k)).toEqual(["aliases"])
  })

  test("wikilinks resolve to the note in the same language", () => {
    const related = noteProperties(vi.get("06_Reference/Niklas Luhmann")!).find(([k]) => k === "related")![1]
    expect(related).toEqual({ kind: "text", text: "the slip box", href: "/03_Atomic/Zettelkasten" })
  })

  test("protected notes show no properties", () => {
    expect(noteProperties(vi.get("06_Reference/Secret")!)).toEqual([])
  })
})
