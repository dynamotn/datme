import { describe, expect, test } from "bun:test"
import { minutesLeft, progressOf } from "../src/scripts/progress"

describe("reading progress", () => {
  test("from the top of the note to its end seen at the bottom of the window", () => {
    expect(progressOf(0, 100, 2100, 1000)).toBe(0)
    expect(progressOf(650, 100, 2100, 1000)).toBe(0.5)
    expect(progressOf(1200, 100, 2100, 1000)).toBe(1)
    expect(progressOf(5000, 100, 2100, 1000)).toBe(1)
  })

  test("a note shorter than the window is read once its end shows", () => {
    expect(progressOf(0, 100, 500, 1000)).toBe(1)
    expect(progressOf(0, 900, 500, 1000)).toBe(0)
  })

  test("minutes left round up, at 220 words a minute", () => {
    expect(minutesLeft(2200, 0)).toBe(10)
    expect(minutesLeft(2200, 0.95)).toBe(1)
    expect(minutesLeft(2200, 1)).toBe(0)
  })
})
