/** Pure text helpers for search, kept free of browser-only imports so they can be tested. */

/** Lowercase and strip diacritics, so "ghi chu" matches "ghi chú". */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/** Highlight query terms, matching without diacritics. Each char folds to one char. */
export function highlight(text: string, terms: string[]): string {
  const folded = [...text].map((c) => fold(c) || c).join("")
  if ([...text].length !== folded.length || !terms.length) return esc(text)
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
    out += esc(c)
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
