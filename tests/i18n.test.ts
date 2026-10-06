import { describe, expect, test } from "bun:test"
import { t, langPrefix, formatDate, langMeta } from "../src/lib/i18n"

describe("i18n", () => {
  test("the default language lives at the root", () => {
    expect(langPrefix("vi-VN")).toBe("")
    expect(langPrefix("en-US")).toBe("en-US/")
  })

  test("Vietnamese and English ship the same keys", () => {
    expect(Object.keys(t("vi-VN")).sort()).toEqual(Object.keys(t("en-US")).sort())
  })

  test("counted strings fill in a localised number", () => {
    expect(t("en-US").readingTime(3)).toBe("3 min read")
    expect(t("vi-VN").notesCount(5)).toBe("5 ghi chú")
    expect(t("en-US").words(12345)).toBe("12,345 words")
  })

  test("other variants of a base language reuse its strings", () => {
    expect(t("vi").search).toBe(t("vi-VN").search)
  })

  test("languages without built-in strings fall back to English", () => {
    expect(t("fr-FR").search).toBe("Search")
    expect(t("fr-FR").notesCount(2)).toBe("2 notes")
  })

  test("datme.yaml can override strings per language", () => {
    expect(t("en-US").blog).toBe("Essays")
    expect(t("vi-VN").blog).toBe("Bài viết")
  })

  test("langMeta names languages natively", () => {
    expect(langMeta("vi-VN")).toEqual({ short: "VI", name: "Tiếng Việt", html: "vi-VN" })
    expect(langMeta("fr-FR").name).toBe("Français")
  })

  test("formatDate is localised and tolerates a missing date", () => {
    const d = new Date("2024-05-14T12:00:00Z")
    expect(formatDate(d, "en-US")).toBe("May 14, 2024")
    expect(formatDate(undefined, "vi-VN")).toBe("")
  })
})
