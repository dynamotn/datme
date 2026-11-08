/** Pure text helpers for search, kept free of browser-only imports so they can be tested. */

import { escapeAttr } from "../lib/html"

/** Lowercase and strip diacritics, so "ghi chu" matches "ghi chú". */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()

/** Highlight query terms, matching without diacritics. Each char folds to one char. */
export function highlight(text: string, terms: string[]): string {
  const folded = [...text].map((c) => fold(c) || c).join("")
  if ([...text].length !== folded.length || !terms.length) return escapeAttr(text)
  const chars = [...text]
  const marks = new Array(chars.length).fill(false)
  for (const term of terms) {
    if (!term) continue
    let i = folded.indexOf(term)
    while (i >= 0) {
      for (let j = i; j < i + term.length; j++) marks[j] = true
      i = folded.indexOf(term, i + term.length)
    }
  }
  let out = ""
  let open = false
  chars.forEach((c, i) => {
    if (marks[i] && !open) (out += "<mark>"), (open = true)
    if (!marks[i] && open) (out += "</mark>"), (open = false)
    out += escapeAttr(c)
  })
  return open ? out + "</mark>" : out
}

export function snippet(content: string, terms: string[]): string {
  const folded = fold(content)
  const pos = Math.min(...terms.map((t) => folded.indexOf(t)).filter((i) => i >= 0), Infinity)
  if (!Number.isFinite(pos)) return content.slice(0, 160)
  const start = Math.max(0, pos - 60)
  return (start > 0 ? "…" : "") + content.slice(start, start + 180)
}

/** Folded words of a text, punctuation dropped: the form phrases are matched in. */
const words = (s: string) =>
  fold(s)
    .split(/[\p{Z}\p{P}\s]+/u)
    .filter(Boolean)

/**
 * The quoted phrases of a query, each as the words it must find in a row, between spaces.
 * A quote still open, as while the reader types, leaves its last word a prefix.
 */
export function phrases(q: string): string[] {
  return [...q.matchAll(/"([^"]*)("?)/g)].flatMap(([, p, closed]) => (words(p).length ? [` ${words(p).join(" ")}${closed ? " " : ""}`] : []))
}

/** Whether a text holds a phrase from {@link phrases}. */
export const holds = (text: string, phrase: string) => ` ${words(text).join(" ")} `.includes(phrase)

/** Languages written with spaces between syllables, where a word is often two or three of them ("Hà Nội"). */
const SYLLABIC = new Set(["vi"])
export const syllabic = (lang: string) => SYLLABIC.has(lang.split("-")[0].toLowerCase())

/** Each two neighbouring words, as one term: "hà nội" from "Hà Nội". Punctuation breaks pairs. */
export const pairs = (text: string) =>
  text.split(/[\p{P}\n\r]+/u).flatMap((run) => {
    const w = run.split(/[\p{Z}\s]+/u).filter(Boolean)
    return w.slice(1).map((b, i) => `${w[i]} ${b}`)
  })
