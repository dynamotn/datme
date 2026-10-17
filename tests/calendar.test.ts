import { describe, expect, test } from "bun:test"
import { activityWeeks, activeYears, dayKey, monthOf, yearOf } from "../src/lib/calendar"

const d = (s: string) => new Date(s + "T10:00")
const notes = [
  { title: "A", created: d("2024-05-14"), updated: d("2024-05-14") },
  { title: "B", created: d("2024-05-14"), updated: d("2025-06-01") },
  { title: "C", created: d("2023-01-01") },
]

describe("activityWeeks", () => {
  const weeks = activityWeeks(notes, 2024)
  const days = weeks.flat()

  test("whole Monday-first weeks covering the year, padded outside it", () => {
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(days[0].date.getDay()).toBe(1)
    expect(days.find((x) => !x.outside)!.key).toBe("2024-01-01")
    expect(days.filter((x) => !x.outside).at(-1)!.key).toBe("2024-12-31")
  })

  test("a day counts creations and later updates, not a same-day edit twice", () => {
    const may14 = days.find((x) => x.key === "2024-05-14")!
    expect(may14.created).toEqual(["A", "B"])
    expect(may14.updated).toEqual([])
    expect(may14.level).toBe(2)
    expect(activityWeeks(notes, 2025).flat().find((x) => x.key === "2025-06-01")!.updated).toEqual(["B"])
  })

  test("other years stay out", () => {
    expect(days.some((x) => x.created.includes("C"))).toBe(false)
  })
})

describe("activeYears", () => {
  test("every year with a creation or update, newest first", () => {
    expect(activeYears(notes)).toEqual([2025, 2024, 2023])
    expect(activeYears([{}])).toEqual([])
    expect(dayKey(d("2024-01-02"))).toBe("2024-01-02")
  })
})

describe("date-only values west of UTC", () => {
  // A date-only value is UTC midnight: in New York it is the evening of the day before.
  const inNewYork = <T>(fn: () => T): T => {
    const tz = process.env.TZ
    process.env.TZ = "America/New_York"
    try {
      return fn()
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  }

  test("yearOf and monthOf keep the written year and month", () => {
    const [year, month] = inNewYork(() => [yearOf(new Date("2024-01-01")), monthOf(new Date("2024-03-01"))])
    expect(year).toBe(2024)
    expect(month).toBe(2)
  })

  test("a note dated on New Year's day counts in its own year", () => {
    expect(inNewYork(() => activeYears([{ created: new Date("2024-01-01") }]))).toEqual([2024])
  })
})
