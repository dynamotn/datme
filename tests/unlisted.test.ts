import { describe, expect, test } from "bun:test"
import { engineFor, renderDataview, renderInlineQuery } from "../src/lib/dataview-render"
import { renderBaseBlock } from "../src/lib/base-render"

// tests/fixtures/vault/08_Journal/Unlisted.md is published but unlisted.
const LANG = "en-US"
const KEY = "08_Journal/Unlisted"
const text = (r: string | { markdown: string }) => (typeof r === "string" ? r : r.markdown)

describe("unlisted notes in queries", () => {
  test("Dataview and Bases do not list them", () => {
    expect(engineFor(LANG).pages.map((p) => p.key)).not.toContain(KEY)
    expect(text(renderDataview('LIST FROM "08_Journal"', LANG, "03_Atomic/Queries"))).not.toContain(KEY)
    const base = renderBaseBlock("views:\n  - type: table\n    filters: 'file.inFolder(\"08_Journal\")'\n", LANG, "03_Atomic/Queries")
    expect(base).toContain("<table")
    expect(base).not.toContain(KEY)
  })

  test("an unlisted note still queries itself", () => {
    expect(renderInlineQuery("this.file.name", LANG, KEY)).toContain("Unlisted")
  })
})
