/**
 * Flashcards in the syntax of the Obsidian Spaced Repetition plugin, rendered
 * as cards that flip open: `Q::A`, reversed `Q:::A`, and multi-line cards
 * whose question and answer are split by a line holding `?` (or `??`).
 * Only notes tagged as a deck are converted, since `key:: value` is also a
 * Dataview inline field.
 */

/** Whether a note is a deck: a frontmatter tag, or an inline #tag in its body. */
export function isDeck(tags: string[], body: string, deckTags: string[]): boolean {
  const lower = deckTags.map((t) => t.toLowerCase())
  if (tags.some((t) => lower.some((d) => t.toLowerCase() === d || t.toLowerCase().startsWith(d + "/")))) return true
  return lower.some((d) => new RegExp(`(^|\\s)#${d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/[\\w/-]*)?(?=\\s|$)`, "im").test(body))
}

/** A card whose question and answer keep their markdown: blank lines around each part. */
const block = (q: string, a: string, hint: string) =>
  `<details class="flashcard">\n<summary data-hint="${hint}">\n\n${q.trim()}\n\n</summary>\n<div class="flashcard-answer">\n\n${a.trim()}\n\n</div>\n</details>`

/** Inside a list a card must stay on one line, so its markdown is not parsed. */
const inline = (q: string, a: string, hint: string) =>
  `<details class="flashcard"><summary data-hint="${hint}">${q.trim()}</summary><div class="flashcard-answer">${a.trim()}</div></details>`

/** A line with inline code blanked out at the same length, to find separators outside code. */
const maskCode = (line: string) => line.replace(/(`+)[^`]*?\1/g, (s) => "\u0001".repeat(s.length))

export function flashcards(md: string, hint: string): string {
  const hintAttr = hint.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
  const lines = md.split("\n")
  const out: string[] = []
  let fence: string | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const f = line.match(/^\s*(`{3,}|~{3,})/)
    if (f && (!fence || f[1].startsWith(fence))) {
      fence = fence ? undefined : f[1]
      out.push(line)
      continue
    }
    if (fence || /^\s*(#|>|\||\$\$)/.test(line)) {
      out.push(line)
      continue
    }

    // Multi-line card: the paragraph above `?` is the question, the one below the answer.
    const sep = line.trim()
    if ((sep === "?" || sep === "??") && out.length && out[out.length - 1].trim()) {
      let start = out.length
      while (start > 0 && out[start - 1].trim()) start--
      const question = out.splice(start).join("\n")
      const answer: string[] = []
      while (i + 1 < lines.length && lines[i + 1].trim()) answer.push(lines[++i])
      out.push(block(question, answer.join("\n"), hintAttr))
      if (sep === "??") out.push("", block(answer.join("\n"), question, hintAttr))
      continue
    }

    const masked = maskCode(line)
    const m = masked.match(/^(\s*(?:[-*+]|\d+[.)])\s+)?(.*?)(:{2,3})(?!:)(.*)$/)
    const bullet = m?.[1]
    const at = m ? (bullet?.length ?? 0) + m[2].length : -1
    const q = m ? line.slice(bullet?.length ?? 0, at) : ""
    const a = m ? line.slice(at + m[3].length) : ""
    if (!m || !q.trim() || !a.trim() || /:$/.test(q)) {
      out.push(line)
      continue
    }
    const reversed = m[3] === ":::"
    if (bullet || /^\s/.test(line)) {
      const cards = [inline(q, a, hintAttr), ...(reversed ? [inline(a, q, hintAttr)] : [])]
      out.push((bullet ?? "") + cards.join(" "))
    } else {
      // Blank lines keep each card a block of its own, even inside a paragraph.
      out.push("", block(q, a, hintAttr), ...(reversed ? ["", block(a, q, hintAttr)] : []), "")
    }
  }
  return out.join("\n")
}
