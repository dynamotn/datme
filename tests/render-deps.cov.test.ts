import { describe, expect, test } from "bun:test"
import { getVault, type Note } from "../src/lib/vault"
import { dependencies } from "../src/lib/render-deps"

const lang = "vi-VN"
const note = (key: string) => getVault().byKey[lang].get(key)!
const embed = (key: string) => `<span class="transclude-ph" data-key="${key}" data-fragment=""></span>`

describe("dependencies through embeds", () => {
  test("a note embedding one that reads the time is not cached either", () => {
    const target = note("06_Reference/Niklas Luhmann")
    const md = target.md
    // The embedded note shows the time, as if it had been written so.
    target.md = "Rendered at `= date(now)`"
    try {
      expect(dependencies(target)).toBeUndefined()
      const host: Note = { ...note("03_Atomic/Zettelkasten"), md: embed("06_Reference/Niklas Luhmann") }
      expect(dependencies(host)).toBeUndefined()
    } finally {
      target.md = md
    }
    // Back to plain text, the same embed can be cached again.
    const host: Note = { ...note("03_Atomic/Zettelkasten"), md: embed("06_Reference/Niklas Luhmann") }
    expect(dependencies(host)?.some((p) => p.startsWith("embed:06_Reference/Niklas Luhmann:"))).toBe(true)
  })

  test("a Dataview query that does not parse renders its error, whatever the vault holds", () => {
    const md = "```dataview\nTHIS IS NOT A QUERY\n```"
    expect(dependencies({ ...note("03_Atomic/Zettelkasten"), md })).toContain("query:error")
  })

  test("a missing embed and the depth limit are keyed by what shows", () => {
    expect(dependencies({ ...note("03_Atomic/Zettelkasten"), md: embed("Nowhere/Missing") })).toEqual(["embed:Nowhere/Missing:missing"])
    const deep = dependencies({ ...note("03_Atomic/Zettelkasten"), md: embed("06_Reference/Niklas Luhmann") }, 3)!
    expect(deep).toHaveLength(1)
    expect(deep[0]).toMatch(/^embed:06_Reference\/Niklas Luhmann:.*:false$/)
  })
})
