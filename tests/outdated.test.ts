import { describe, expect, test } from "bun:test"
import { freshness, isOutdated } from "../src/scripts/outdated"

describe("outdated notes", () => {
  const now = new Date("2026-10-17T00:00:00Z")

  test("a note is outdated once the configured years have passed", () => {
    expect(isOutdated(new Date("2024-05-01"), 2, now)).toBe(true)
    expect(isOutdated(new Date("2025-05-01"), 2, now)).toBe(false)
  })

  test("fractions of a year work, for gardens that move fast", () => {
    expect(isOutdated(new Date("2026-03-01"), 0.5, now)).toBe(true)
    expect(isOutdated(new Date("2026-06-01"), 0.5, now)).toBe(false)
  })

  test("freshness buckets a note by the days since it was last tended", () => {
    expect(freshness(1000, 1030)).toBe("month")
    expect(freshness(1000, 1031)).toBe("year")
    expect(freshness(1000, 1365)).toBe("year")
    expect(freshness(1000, 1366)).toBe("older")
  })
})
