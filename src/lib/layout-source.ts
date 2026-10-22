import { fenceAfter } from "./locked"

/**
 * What some layouts need of a note's markdown before it is rendered, since
 * the HTML no longer has it: the indentation of a poem's lines, and the list
 * markers of pros and cons.
 */

/** Every line with its fence state: whether it is inside a code fence (or is one). */
function eachLine(md: string, by: (line: string) => string): string {
  let fence: string | null = null
  return md
    .split("\n")
    .map((line) => {
      const before = fence
      fence = fenceAfter(fence, line)
      return before !== null || fence !== null ? line : by(line)
    })
    .join("\n")
}

/**
 * A poem's indentation kept: the spaces and tabs a line starts with become
 * non-breaking spaces, which markdown neither strips nor reads as code.
 */
export function keepIndent(md: string): string {
  return eachLine(md, (line) => {
    const lead = line.match(/^[ \t]+(?=\S)/)?.[0]
    return lead ? lead.replace(/\t/g, "    ").replace(/ /g, " ") + line.slice(lead.length) : line
  })
}

const MARKED = /^([+-])[ \t]+(?![✅❌✔✖✗👍👎➕➖])(?=\S)/u

/**
 * Pros and cons written with list markers: an item written `+ …` is a pro,
 * and in a list that has one, an item written `- …` is a con. They become
 * `* ✅ …` and `* ❌ …`, which the compare layout reads: a list of their own,
 * even beside another list written with `-`.
 */
export function markProsCons(md: string): string {
  const lines = md.split("\n")
  // Runs of top-level items, each marked + or -, outside code fences.
  const marked: boolean[] = eachLine(md, (line) => (MARKED.test(line) ? "\u0000" : "")).split("\n").map((l) => l === "\u0000")
  for (let i = 0; i < lines.length; ) {
    if (!marked[i]) {
      i++
      continue
    }
    let end = i
    while (end < lines.length && marked[end]) end++
    if (lines.slice(i, end).some((l) => l.startsWith("+"))) {
      for (let j = i; j < end; j++) lines[j] = lines[j].replace(MARKED, (_m, sign: string) => (sign === "+" ? "* ✅ " : "* ❌ "))
    }
    i = end
  }
  return lines.join("\n")
}
