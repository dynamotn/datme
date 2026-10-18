import { fenceAfter } from "./locked"
import { noteMarkdown } from "./llms"
import type { Note } from "./vault"

/** Escaped characters, kept aside from the markup rules as private-use code points. */
const ESCAPED = 0xe000
const hide = (s: string) => s.replace(/\\([\\`*_{}[\]()#+\-.!|~<>$=^])/g, (_, c: string) => String.fromCharCode(ESCAPED + c.charCodeAt(0)))
const unhide = (s: string) => s.replace(/[-]/g, (c) => String.fromCharCode(c.charCodeAt(0) - ESCAPED))

const plain = (s: string) =>
  unhide(
    hide(s)
      .replace(/!\[\[[^\]]*\]\]/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[\^[^\]]+\]/g, "")
      .replace(/\^\[[^\]]*\]/g, "")
      .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
      .replace(/\[\[([^\]]*)\]\]/g, (_, target: string) => target.replace(/#\^?/g, " "))
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[a-z][\w+.-]*:[^>\s]*>/gi, "")
      .replace(/<\/?[a-z][^>]*>/gi, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\$(?=\S)[^$\n]*\S\$(?!\d)/g, "")
      .replace(/(^|\s)#[\p{L}_][\p{L}\p{N}_/-]*/gu, "$1")
      .replace(/\s\^[\w-]+$/, "")
      .replace(/(\*\*|__|~~|==|`)/g, "")
      .replace(/(^|\s)[*_]+|[*_]+(?=\s|$|[.,;:!?])/g, "$1"),
  )
    // An escaped star or underscore is still markup to the ear.
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()

// A point between digits, as in 3.14, does not end a sentence.
const sentences = (text: string) =>
  text.match(/(?:[^.!?…。！？]|\.(?=\d))+[.!?…。！？]+(?!\d)["')\]」』]*\s*|(?:[^.!?…。！？]|\.(?=\d))+$/g) ?? [text]

/** Text longer than max cut at its last comma within max, else its last space, else mid-word. */
function breakLong(text: string, max: number): string[] {
  const out: string[] = []
  let rest = text
  while (rest.length > max) {
    const head = rest.slice(0, max + 1)
    const comma = Math.max(head.lastIndexOf(", "), head.lastIndexOf("، "), head.lastIndexOf("，"))
    const at = comma > 0 ? comma + 1 : head.lastIndexOf(" ") > 0 ? head.lastIndexOf(" ") : max
    out.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  return rest ? [...out, rest] : out
}

/** A paragraph as chunks of whole sentences, each within max; a longer sentence breaks at a comma or between words. */
function split(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const out: string[] = []
  let cur = ""
  for (const s of sentences(text).flatMap((x) => breakLong(x.trim(), max))) {
    if (cur && cur.length + 1 + s.length > max) {
      out.push(cur)
      cur = s
    } else cur = cur ? `${cur} ${s}` : s
  }
  return cur ? [...out, cur] : out
}

/** A table row as its cells, or null for the line under the header. */
const tableRow = (line: string) =>
  /^\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*\|?$/.test(line)
    ? null
    : line
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(", ")

/** Markdown as the paragraphs a voice reads: no code, math, embeds, footnotes or markup, long ones split at sentence ends. */
export function spokenChunks(markdown: string, maxChars = 400): string[] {
  const blocks: string[] = []
  let para: string[] = []
  let fence: string | null = null
  let math = false
  const flush = () => {
    const text = plain(para.join(" "))
    if (text) blocks.push(text)
    para = []
  }
  for (const raw of markdown.split("\n")) {
    const unquoted = raw.replace(/^(\s*>)+/, "")
    const was = fence
    fence = fenceAfter(fence, unquoted)
    if (was !== null || fence !== null) continue
    const line = unquoted.trim()
    if (math || line.startsWith("$$")) {
      // A display formula: $$ opens and closes it, both on one line or on lines of their own.
      const marks = line.split("$$").length - 1
      if (marks % 2 === 1) math = !math
      flush()
      continue
    }
    const item = /^([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/
    // Indented code: four spaces or a tab, opening a block, and no list item.
    if (!para.length && /^( {4}|\t)/.test(unquoted) && !item.test(line)) continue
    // Rules, setext underlines and footnote definitions end the paragraph and say nothing.
    if (!line || /^([-*_])(\s*\1){2,}$/.test(line) || /^=+$/.test(line) || /^\[\^[^\]]+\]:/.test(line)) {
      flush()
      continue
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    const callout = line.match(/^\[![^\]]*\][+-]?\s*(.*)$/)
    const row = line.startsWith("|") ? tableRow(line) : undefined
    if (heading || callout || row !== undefined) {
      flush()
      if (row !== null) para.push(row ?? (heading ?? callout)![1])
      flush()
      continue
    }
    if (item.test(line)) {
      // Each list item ends as a sentence, so the voice pauses between items.
      const text = line.replace(item, "")
      para.push(/[.!?…:;,。！？]$/.test(text) ? text : `${text}.`)
    } else para.push(line)
  }
  flush()
  return blocks.flatMap((b) => split(b, maxChars))
}

/** The chunks a note is read in: what its page shows to everyone, without locked parts. */
export const noteChunks = (n: Note): string[] => spokenChunks(noteMarkdown(n))
