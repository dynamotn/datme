import { describe, expect, test } from "bun:test"
import { formatWhen, parseLocation, parseWhen, places, timeline, whenKey } from "../src/lib/places"

describe("dates of events", () => {
  test("years, months, days, BCE and timestamps", () => {
    expect(parseWhen(1927)).toEqual({ year: 1927 })
    expect(parseWhen("1927-12")).toEqual({ year: 1927, month: 12 })
    expect(parseWhen("1927-12-08T10:00")).toEqual({ year: 1927, month: 12, day: 8 })
    expect(parseWhen("-0500")).toEqual({ year: -500 })
    expect(parseWhen("1927-13")).toBeUndefined()
    expect(parseWhen("soon")).toBeUndefined()
  })

  test("shown as precisely as written", () => {
    expect(formatWhen({ year: 1927 }, "en-US")).toBe("1927")
    expect(formatWhen({ year: 1927, month: 12 }, "en-US")).toBe("December 1927")
    expect(formatWhen({ year: 1927, month: 12, day: 8 }, "en-US")).toBe("Dec 8, 1927")
    expect(formatWhen({ year: -500 }, "vi-VN")).toBe("500 TCN")
  })

  test("sorted from the oldest, a bare year before its months", () => {
    const sorted = [{ year: 1927, month: 3 }, { year: -500 }, { year: 1927 }].sort((a, b) => whenKey(a) - whenKey(b))
    expect(sorted).toEqual([{ year: -500 }, { year: 1927 }, { year: 1927, month: 3 }])
  })
})

describe("locations", () => {
  test("pairs, strings and objects; nonsense is ignored", () => {
    expect(parseLocation([52.03, 8.53])).toEqual([52.03, 8.53])
    expect(parseLocation("52.03, 8.53")).toEqual([52.03, 8.53])
    expect(parseLocation({ lat: 1, lon: 2 })).toEqual([1, 2])
    expect(parseLocation([95, 0])).toBeUndefined()
    expect(parseLocation("Bielefeld")).toBeUndefined()
  })
})

describe("the fixture vault", () => {
  test("a note with start and end is on the timeline, protected notes never are", () => {
    const events = timeline("en-US")
    expect(events.map((e) => e.note.title)).toEqual(["Niklas Luhmann (sociologist)"])
    expect(events[0]).toMatchObject({ start: { year: 1927, month: 12, day: 8 }, end: { year: 1998, month: 11, day: 6 } })
  })

  test("a note with a location is on the map", () => {
    expect(places("vi-VN")).toEqual([
      expect.objectContaining({ lat: 52.0302, lng: 8.5325, title: "Niklas Luhmann", url: "/06_Reference/Niklas-Luhmann" }),
    ])
  })
})
