import { fenceAfter } from "./locked"
import { noteMarkdown } from "./llms"
import type { Note } from "./vault"

const plain = (s: string) =>
  s
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|==|`)/g, "")
    .replace(/(^|\s)[*_]+|[*_]+(?=\s|$|[.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()

const sentences = (text: string) => text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [text]

/** A paragraph as chunks of whole sentences, each within max unless one sentence is longer. */
function split(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const out: string[] = []
  let cur = ""
  for (const s of sentences(text).map((x) => x.trim())) {
    if (cur && cur.length + 1 + s.length > max) {
      out.push(cur)
      cur = s
    } else cur = cur ? `${cur} ${s}` : s
  }
  return cur ? [...out, cur] : out
}

/** Markdown as the paragraphs a voice reads: no code, embeds, footnotes or markup, long ones split at sentence ends. */
export function spokenChunks(markdown: string, maxChars = 400): string[] {
  const blocks: string[] = []
  let para: string[] = []
  let fence: string | null = null
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
    if (!line || /^([-*_])(\s*\1){2,}$/.test(line) || /^\[\^[^\]]+\]:/.test(line)) {
      flush()
      continue
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    const callout = line.match(/^\[![^\]]*\][+-]?\s*(.*)$/)
    if (heading || callout) {
      flush()
      para.push((heading ?? callout)![1])
      flush()
      continue
    }
    para.push(line.replace(/^([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, ""))
  }
  flush()
  return blocks.flatMap((b) => split(b, maxChars))
}

/** The chunks a note is read in: what its page shows to everyone, without locked parts. */
export const noteChunks = (n: Note): string[] => spokenChunks(noteMarkdown(n))
