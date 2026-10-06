import { describe, expect, test } from "bun:test"
import { activityWeeks, activeYears, dayKey } from "../src/lib/calendar"

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
