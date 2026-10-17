import { afterEach, describe, expect, test } from "bun:test"
import { formatWhen, hasMap, hasTimeline, parseLocation, parseWhen, places, timeline } from "../src/lib/places"
import { site } from "../src/site.config"
import { listed } from "../src/lib/vault"

describe("parseWhen edge cases", () => {
  test("only integers and strings are dates; days out of range are not", () => {
    expect(parseWhen(1927.5)).toBeUndefined()
    expect(parseWhen(null)).toBeUndefined()
    expect(parseWhen({ year: 1 })).toBeUndefined()
    expect(parseWhen("1927-12-32")).toBeUndefined()
    expect(parseWhen("1927-13-01")).toBeUndefined()
    expect(parseWhen(" 1927-02-03 10:00 ")).toEqual({ year: 1927, month: 2, day: 3 })
  })

  test("a month or day of zero is not a date", () => {
    expect(parseWhen("1927-00")).toBeUndefined()
    expect(parseWhen("1927-03-00")).toBeUndefined()
  })

  test("years before 100 stay numbers; a year with a month before 100 too", () => {
    expect(formatWhen({ year: 42, month: 3 }, "en-US")).toBe("42")
    expect(formatWhen({ year: -44, month: 3, day: 15 }, "en-US")).toContain("44")
  })
})

describe("parseLocation edge cases", () => {
  test("latitude/longitude spellings, wrong arity and non-numbers", () => {
    expect(parseLocation({ latitude: "10", longitude: "20" })).toEqual([10, 20])
    expect(parseLocation({ lat: 1, lng: 2 })).toEqual([1, 2])
    expect(parseLocation({ lat: 1, long: 3 })).toEqual([1, 3])
    expect(parseLocation([1, 2, 3])).toBeUndefined()
    expect(parseLocation(["a", "b"])).toBeUndefined()
    expect(parseLocation([0, 181])).toBeUndefined()
    expect(parseLocation(42)).toBeUndefined()
    expect(parseLocation(null)).toBeUndefined()
  })
})

describe("what a language has to show", () => {
  test("the fixture vault has both a timeline and a map", () => {
    expect(hasTimeline("en-US")).toBe(true)
    expect(hasMap("vi-VN")).toBe(true)
  })

  describe("notes tagged as events", () => {
    const before = site.conventions.timelineTags
    afterEach(() => {
      site.conventions.timelineTags = before
    })

    test("a tagged note without `start` is placed at its date, or the day it was created", () => {
      const candidate = listed("en-US").find((n) => !n.protected && !n.isHome && n.tags.some((t) => t.includes("/")) && n.source.fm.start == null)
      expect(candidate).toBeDefined()
      const tag = candidate!.tags.find((t) => t.includes("/"))!
      // The parent of a nested tag names every tag below it.
      site.conventions.timelineTags = [tag.split("/")[0]]
      const event = timeline("en-US").find((e) => e.note.key === candidate!.key)
      expect(event).toBeDefined()
      const expected = parseWhen(candidate!.source.fm.date) ?? {
        year: candidate!.created!.getFullYear(),
        month: candidate!.created!.getMonth() + 1,
        day: candidate!.created!.getDate(),
      }
      expect(event!.start).toEqual(expected)
    })

    test("without timeline tags or locations nothing is shown", () => {
      site.conventions.timelineTags = []
      const titles = timeline("en-US").map((e) => e.note.title)
      expect(titles).toEqual(["Niklas Luhmann (sociologist)"])
      expect(places("en-US").every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true)
    })
  })
})
