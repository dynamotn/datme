import { describe, expect, test } from "bun:test"
import { builtin, t, langPrefix, formatDate, langMeta, type StringKey } from "../src/lib/i18n"
import { dayKey } from "../src/lib/calendar"

describe("i18n", () => {
  test("the default language lives at the root", () => {
    expect(langPrefix("vi-VN")).toBe("")
    expect(langPrefix("en-US")).toBe("en-US/")
  })

  test("every built-in language has exactly the keys of English, with the same placeholders", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const [lang, strings] of Object.entries(builtin)) {
      expect({ lang, keys: Object.keys(strings).sort() }).toEqual({ lang, keys: Object.keys(builtin.en).sort() })
      for (const [key, value] of Object.entries(strings)) {
        expect({ lang, key, value: placeholders(value!) }).toEqual({ lang, key, value: placeholders(builtin.en[key as StringKey]!) })
      }
    }
  })

  test("French, German, Spanish, Japanese and Chinese are built in", () => {
    expect(t("fr-FR").search).toBe("Rechercher")
    expect(t("de-DE").notesCount(2)).toBe("2 Notizen")
    expect(t("es-ES").backlinks).toBe("Enlaces entrantes")
    expect(t("ja-JP").search).toBe("検索")
    expect(t("zh-CN").readingTime(3)).toBe("阅读约 3 分钟")
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
    expect(t("fi-FI").search).toBe("Search")
    expect(t("fi-FI").notesCount(2)).toBe("2 notes")
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

  test("a date-only value shows the day it names in any time zone", () => {
    const tz = process.env.TZ
    try {
      process.env.TZ = "America/New_York"
      expect(formatDate(new Date("2024-01-05"), "en-US")).toBe("Jan 5, 2024")
      expect(dayKey(new Date("2024-01-05"))).toBe("2024-01-05")
      // A moment keeps the local day: 23:00 here is already the next day in UTC.
      expect(formatDate(new Date(2024, 0, 5, 23), "en-US")).toBe("Jan 5, 2024")
      expect(dayKey(new Date(2024, 0, 5, 23))).toBe("2024-01-05")
    } finally {
      // bun test runs in UTC unless TZ is set.
      process.env.TZ = tz ?? "UTC"
    }
  })
})
