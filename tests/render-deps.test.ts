import { describe, expect, test } from "bun:test"
import { getVault, type Note } from "../src/lib/vault"
import { dependencies, vaultSignature } from "../src/lib/render-deps"
import { formatCacheStats } from "../src/lib/render-cache"

const vault = getVault()
const lang = "vi-VN"
const note = (key: string) => vault.byKey[lang].get(key)!
/** A published note given other markdown, as if it had been written so. */
const as = (md: string, key = "03_Atomic/Zettelkasten"): Note => ({ ...note(key), md })
const fence = (lang: string, body: string) => "```" + lang + "\n" + body + "\n```"

describe("dependencies of a rendered note", () => {
  test("a note reading nothing else has none", () => {
    expect(dependencies(as("Just text and a [[link]]."))).toEqual([])
  })

  test("an embed depends on the embedded note, followed into what it embeds", () => {
    const parts = dependencies(note("06_Reference/Niklas Luhmann"))!
    expect(parts.some((p) => p.startsWith("embed:03_Atomic/Zettelkasten:"))).toBe(true)
  })

  test("an embed cycle ends", () => {
    const self = as('<span class="transclude-ph" data-key="03_Atomic/Zettelkasten" data-fragment=""></span>')
    expect(dependencies(self)).toEqual([expect.stringMatching(/^embed:03_Atomic\/Zettelkasten:.*:false$/)])
  })

  test("a Dataview query FROM a folder depends on that folder's pages, not the whole vault", () => {
    const reference = dependencies(as(fence("dataview", 'LIST FROM "06_Reference"')))!
    const atomic = dependencies(as(fence("dataview", 'LIST FROM "03_Atomic"')))!
    const all = `vault:${vaultSignature(lang)}`
    expect(reference).not.toContain(all)
    expect(reference.find((p) => p.startsWith("query:"))).not.toBe(atomic.find((p) => p.startsWith("query:")))
    expect(dependencies(as(fence("dataview", "LIST")))).toContain(`query:${vaultSignature(lang)}`)
    expect(dependencies(as(fence("dataview", "LIST FROM [[Niklas Luhmann]]")))).toContain(`query:${vaultSignature(lang)}`)
  })

  test("other queries and bases depend on every page", () => {
    for (const md of [fence("tasks", "not done"), fence("query", "slip box"), '<span class="base-ph" data-rel="x.base" data-view=""></span>']) {
      expect(dependencies(as(md))).toContain(`vault:${vaultSignature(lang)}`)
    }
  })

  test("an inline query reads the note itself unless it names another", () => {
    const own = dependencies(as("Score: `= this.rating * 2`"))!
    expect(own).toHaveLength(1)
    expect(own[0]).toStartWith("self:")
    expect(dependencies(as("`= [[Niklas Luhmann]].file.name`"))).toContain(`vault:${vaultSignature(lang)}`)
  })

  test("a query reading the date is keyed by the day; one reading the time is never cached", () => {
    const day = `day:${new Date().toISOString().slice(0, 10)}`
    expect(dependencies(as(fence("tasks", "due before today")))).toContain(day)
    expect(dependencies(as("`= date(now)`"))).toBeUndefined()
  })
})

describe("cache stats", () => {
  test("one line with the share of notes from the cache", () => {
    expect(formatCacheStats({ reused: 6, reusedWithDeps: 2, rendered: 1, uncached: 1 })).toBe(
      "Notes: 8 reused (2 with embeds or queries), 1 rendered, 1 never cached; 80% from the cache",
    )
  })
})
