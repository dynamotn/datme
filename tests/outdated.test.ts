import { describe, expect, test } from "bun:test"
import { isOutdated } from "../src/scripts/outdated"

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
})
