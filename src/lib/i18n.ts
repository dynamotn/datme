import { site, type Lang } from "../site.config"
import { isDateOnly } from "./calendar"
import de from "../i18n/de.json"
import en from "../i18n/en.json"
import es from "../i18n/es.json"
import fr from "../i18n/fr.json"
import ja from "../i18n/ja.json"
import vi from "../i18n/vi.json"
import zh from "../i18n/zh.json"

/**
 * Built-in UI strings by base language, one file per language in src/i18n;
 * "{n}" and the like are filled in. English is the reference: every other
 * file has its keys, which tests/i18n.test.ts checks.
 */
export const builtin: Record<string, Partial<Record<StringKey, string>>> = { de, en, es, fr, ja, vi, zh }

export type StringKey = keyof typeof en
const COUNTED = ["readingTime", "words", "notesCount", "activityCount", "sharedLinks", "seriesPart", "trailSteps"] as const
type Counted = (typeof COUNTED)[number]
export type Strings = Record<Exclude<StringKey, Counted>, string> & Record<Counted, (n: number) => string>

const cache = new Map<Lang, Strings>()

/**
 * UI strings for a language: the built-in set of its base language (English
 * when there is none), overridden by the `strings` section of datme.yaml.
 */
export function t(lang: Lang): Strings {
  let hit = cache.get(lang)
  if (!hit) {
    const base = lang.split("-")[0]
    const merged: Record<string, string> = { ...en, ...(builtin[base] ?? {}), ...(site.strings[lang] ?? {}) }
    const out: Record<string, unknown> = { ...merged }
    for (const key of COUNTED) {
      const template = merged[key]
      out[key] = (n: number) => template.replace("{n}", n.toLocaleString(lang))
    }
    hit = out as Strings
    cache.set(lang, hit)
  }
  return hit
}

/** Short code, native name and HTML tag of a language. */
/** Languages written from right to left, by base tag. */
const RTL = new Set(["ar", "he", "fa", "ur", "ps", "yi", "dv", "ckb", "sd", "ug"])

/** Writing direction of a language, for the dir attribute. */
export function langDir(lang: Lang): "rtl" | "ltr" {
  return RTL.has(lang.split("-")[0].toLowerCase()) ? "rtl" : "ltr"
}

export function langMeta(lang: Lang): { short: string; name: string; html: string } {
  let name = lang
  try {
    name = new Intl.DisplayNames([lang], { type: "language" }).of(lang.split("-")[0]) ?? lang
  } catch {
    // unknown tag: show it as is
  }
  return { short: lang.split("-")[0].toUpperCase(), name: name.charAt(0).toUpperCase() + name.slice(1), html: lang }
}

/** URL prefix of a language: the default language lives at the site root. */
export function langPrefix(lang: Lang): string {
  return lang === site.defaultLang ? "" : `${lang}/`
}

export function formatDate(d: Date | undefined, lang: Lang): string {
  if (!d) return ""
  // A date-only value is UTC midnight: shown in local time, west of UTC it would fall on the day before.
  return d.toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric", timeZone: isDateOnly(d) ? "UTC" : undefined })
}
