/**
 * Where a problem sits in a note's file, as an editor counts: lines and columns
 * from 1, frontmatter included, columns in UTF-16 code units as JavaScript and
 * CodeMirror count them, the end just past the last character (as unist and LSP
 * do). The note is searched as written, so its code, math and comments never match.
 */
import { blankCode, type LinkProblem } from "./obsidian"
import { parseYaml } from "./yaml"

export interface Place {
  line: number
  column: number
  endLine?: number
  endColumn?: number
}

/** Frontmatter at the start of a note, its YAML in group 1: empty when the closing --- follows at once. */
export const FM_RE = /^---\r?\n([\s\S]*?)(?:\r?\n|(?<=\n))---\r?\n?/

/** An editor does not count a byte order mark. */
const unmarked = (src: string) => src.replace(/^﻿/, "")

const pointOf = (src: string, i: number): [number, number] => {
  const before = src.slice(0, i)
  return [before.split("\n").length, i - before.lastIndexOf("\n")]
}

/** The place of `start` to `end` in a text. */
export function placeOf(src: string, start: number, end: number): Place {
  const [line, column] = pointOf(src, start)
  const [endLine, endColumn] = pointOf(src, end)
  return { line, column, endLine, endColumn }
}

const blank = (s: string) => s.replace(/[^\n]/g, " ")
/** The text a link or citation can be written in: no frontmatter, code, math or comment, each character where it was. */
const prose = (src: string) => {
  const fm = src.match(FM_RE)?.[0] ?? ""
  return blankCode(blank(fm) + src.slice(fm.length))
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const norm = (t: string) => t.trim().replace(/^\/+/, "")

const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g
const MDLINK = /(!?)\[[^\]\n]*\]\(\s*<?([^)>\n]+?)>?\s*\)/g

/** Every place a note writes a link (or an embed) to `target`, as a problem names it, in order. */
export function linkPlaces(raw: string, kind: LinkProblem["kind"], target: string): Place[] {
  const src = unmarked(raw)
  const text = prose(src)
  const embed = kind === "embed" || kind === "drawing"
  const want = norm(target)
  const found: [number, number][] = []
  for (const m of text.matchAll(WIKILINK)) {
    const file = m[2].replace(/\\\|/g, "|").split("|")[0].split("#")[0]
    if (!!m[1] === embed && norm(file) === want) found.push([m.index, m.index + m[0].length])
  }
  for (const m of text.matchAll(MDLINK)) {
    let file = m[2].split("#")[0]
    try {
      file = decodeURI(file)
    } catch {
      // kept as written, as the converter keeps it
    }
    if (!!m[1] === embed && norm(file) === want) found.push([m.index, m.index + m[0].length])
  }
  return found.sort((a, b) => a[0] - b[0]).map(([start, end]) => placeOf(src, start, end))
}

/** Every place a note cites `@key` inside brackets, in order. */
export function citationPlaces(raw: string, key: string): Place[] {
  const src = unmarked(raw)
  const cited = new RegExp(`(?<![^\\s;-])@${escapeRe(key)}(?=[\\s,;]|$)`, "g")
  const places: Place[] = []
  for (const m of prose(src).matchAll(/\[([^[\]]*?-?@[^[\]]+?)\](?![(:])/g)) {
    for (const c of m[1].matchAll(cited)) {
      const start = m.index + 1 + c.index
      places.push(placeOf(src, start, start + c[0].length))
    }
  }
  return places
}

/**
 * The place of a frontmatter property's value, such as ["layout"] or ["speakers", "Ann"],
 * or of `item` in it, such as one alias of a list; the key's name when the value is on lines of its own.
 */
export function propertyPlace(raw: string, keys: string[], item?: string): Place | undefined {
  const src = unmarked(raw)
  const fm = src.match(FM_RE)
  if (!fm) return undefined
  // The YAML's lines that hold something, with where each starts in the file.
  let at = src.indexOf("\n") + 1
  const lines = fm[1].split("\n").flatMap((text) => {
    const start = at
    at += text.length + 1
    return text.trim() ? [{ text: text.replace(/\r$/, ""), start, indent: text.length - text.trimStart().length }] : []
  })
  let [from, end, n] = [0, lines.length, -1]
  for (const key of keys) {
    const re = new RegExp(`^\\s*(["']?)${escapeRe(key)}\\1\\s*:`)
    // A key of this level is indented as the first line of its parent's block.
    const level = lines[from]?.indent
    n = lines.findIndex((l, i) => i >= from && i < end && l.indent === level && re.test(l.text))
    if (n < 0) return undefined
    from = n + 1
    const next = lines.findIndex((l, i) => i > n && l.indent <= level && !(l.indent === level && l.text.trimStart().startsWith("-")))
    end = next < 0 ? end : Math.min(next, end)
  }
  const { text, indent } = lines[n]
  const colon = text.indexOf(":", indent + 1)
  const value = text.slice(colon + 1).trim()
  const place = (line: { start: number }, i: number, length: number) => placeOf(src, line.start + i, line.start + i + length)
  if (item) {
    for (const l of lines.slice(n, end)) {
      const i = l.text.indexOf(item, l === lines[n] ? colon : 0)
      if (i >= 0) return place(l, i, item.length)
    }
  }
  return value ? place(lines[n], text.indexOf(value, colon), value.length) : place(lines[n], indent, colon - indent)
}

/** Where the YAML of a note's frontmatter stops making sense, when it does. */
export function yamlErrorPlace(raw: string): Place | undefined {
  const fm = unmarked(raw).match(FM_RE)
  if (!fm) return undefined
  try {
    parseYaml(fm[1], { json: true })
    return undefined
  } catch (e) {
    const mark = (e as { mark?: { line: number; column: number } }).mark
    // The YAML starts on the line after the opening ---.
    return mark && { line: mark.line + 2, column: mark.column + 1 }
  }
}
