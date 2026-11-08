import type { Lang } from "../site.config"
import { fenceAfter } from "./locked"

/** A <!--lang:xx--> marker alone on its line; one quoted in a sentence or a table is text. */
const LANG_MARKER = /^\s*<!--lang:([^\s>]+)-->$/

/**
 * Languages whose <!--lang:xx--> blocks hold real text, in order of first
 * appearance. Blank lines, headings, HTML comments (even over several lines)
 * and empty list items such as `-` or `- [ ]` don't count, so a block a
 * template filled with headings is still untranslated. Same rules as the
 * lang-blocks Obsidian plugin, so the vault and the site agree.
 */
export function textLanguages(src: string): Lang[] {
  let fence: string | null = null
  let inComment = false
  let current: Lang | null = null
  const found: Lang[] = []
  for (let line of src.split("\n")) {
    line = line.replace(/[\t\r ]*$/, "")
    fence = fenceAfter(fence, line)
    if (fence === null) {
      const m = line.match(LANG_MARKER)
      if (m) {
        current = m[1] === "*" ? null : m[1]
        continue
      }
    }
    const text = line.trim()
    if (inComment) {
      if (text.includes("-->")) inComment = false
      continue
    }
    if (fence === null && text.startsWith("<!--")) {
      if (!text.includes("-->")) inComment = true
      continue
    }
    if (current === null || found.includes(current)) continue
    if (text === "" || /^#{1,6}(\s|$)/.test(text) || /^([-*+]|\d+[.)])(\s+\[.\])?$/.test(text)) continue
    found.push(current)
  }
  return found
}

/**
 * Fallback language of a note: its `fallback_lang` frontmatter (the name
 * PolyglotMarkdown uses), else its source language. An empty value or `none`
 * turns the fallback off.
 */
export function fallbackOf(fm: Record<string, unknown>, sourceLang: Lang): Lang | null {
  if (!("fallback_lang" in fm)) return sourceLang
  const v = fm.fallback_lang
  if (typeof v !== "string") return null
  const value = v.trim()
  return value === "" || value.toLowerCase() === "none" ? null : value
}

/**
 * Language whose blocks a page in `lang` shows. A note without text in `lang`
 * shows its fallback language instead, when that has text, rather than only
 * its shared text; a note without language blocks shows everything anyway.
 */
export function contentLanguage(src: string, lang: Lang, fallback: Lang | null, texts = textLanguages(src)): Lang {
  if (texts.includes(lang) || !src.includes("<!--lang:")) return lang
  return fallback !== null && fallback !== lang && texts.includes(fallback) ? fallback : lang
}

/** Port of the fork's MultiLanguage transformer: keeps blocks of one language. */
export function filterLanguage(src: string, lang: Lang): string {
  let fence: string | null = null
  let inLang = false
  let inThisLang = false
  const out: string[] = []
  for (let line of src.split("\n")) {
    // Only the \r goes: two trailing spaces are a line break.
    line = line.replace(/\r$/, "")
    fence = fenceAfter(fence, line)
    if (fence === null) {
      const m = line.trimEnd().match(LANG_MARKER)
      if (m) {
        if (m[1] === "*") {
          inLang = false
          inThisLang = false
        } else {
          inLang = true
          inThisLang = m[1] === lang
        }
        continue
      }
    }
    // A code block of another language's block is that language's too.
    if (inLang && !inThisLang) continue
    out.push(line)
  }
  return out.join("\n")
}
