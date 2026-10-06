import { describe, expect, test } from "bun:test"
import { t, langPrefix, formatDate } from "../src/lib/i18n"

describe("i18n", () => {
  test("the default language lives at the root", () => {
    expect(langPrefix("vi-VN")).toBe("")
    expect(langPrefix("en-US")).toBe("en-US/")
  })

  test("both languages define the same strings", () => {
    expect(Object.keys(t("vi-VN")).sort()).toEqual(Object.keys(t("en-US")).sort())
  })

  test("pluralised helpers interpolate", () => {
    expect(t("en-US").readingTime(3)).toBe("3 min read")
    expect(t("vi-VN").notesCount(5)).toBe("5 ghi chú")
  })

  test("formatDate is localised and tolerates a missing date", () => {
    const d = new Date("2024-05-14T12:00:00Z")
    expect(formatDate(d, "en-US")).toBe("May 14, 2024")
    expect(formatDate(undefined, "vi-VN")).toBe("")
  })
})
