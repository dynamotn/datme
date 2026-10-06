/**
 * Obsidian's search syntax, for ```query blocks run at build time:
 *
 *   words and "exact phrases" (all must match) · OR · -negation · ( )
 *   tag:#tag · path:text · file:text · content:text · line:(a b)
 *
 * Matching ignores case and diacritics, as Obsidian's search does by default.
 */

export interface Searchable {
  title: string
  /** Vault-relative path, with .md. */
  path: string
  tags: string[]
  /** Plain text of the note, one line per source line. */
  text: string
}

type Node =
  | { k: "term"; field: "content" | "path" | "file" | "tag" | "line"; value: string }
  | { k: "line"; all: Node[] }
  | { k: "not"; n: Node }
  | { k: "and" | "or"; a: Node; b: Node }

export class SearchQueryError extends Error {}

/** Lowercase without accents: "Việt" matches "viet", as in Obsidian. */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()

function tokenize(src: string): string[] {
  const out: string[] = []
  const re = /\s*(\(|\)|-?(?:[a-z]+:)?"[^"]*"|-?[a-z]+:\(|[^\s()]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) if (m[1]) out.push(m[1])
  return out
}

export function parseSearch(src: string): Node | undefined {
  const toks = tokenize(src.trim())
  let i = 0
  const peek = () => toks[i]
  function or(): Node {
    let a = and()
    while (peek() === "OR") {
      i++
      a = { k: "or", a, b: and() }
    }
    return a
  }
  function and(): Node {
    let a = unary()
    while (peek() && peek() !== ")" && peek() !== "OR") a = { k: "and", a, b: unary() }
    return a
  }
  function unary(): Node {
    const t = toks[i++]
    if (t === undefined) throw new SearchQueryError("unexpected end of query")
    if (t === "(") {
      const n = or()
      if (toks[i++] !== ")") throw new SearchQueryError('missing ")"')
      return n
    }
    if (t.startsWith("-") && t.length > 1) {
      toks[--i] = t.slice(1)
      return { k: "not", n: unary() }
    }
    const field = t.match(/^([a-z]+):(.*)$/i)
    if (field) {
      const name = field[1].toLowerCase()
      if (!["tag", "path", "file", "content", "line"].includes(name)) throw new SearchQueryError(`unsupported operator "${name}:"`)
      if (name === "line") {
        if (field[2] !== "(") throw new SearchQueryError('line: expects "(…)"')
        const all: Node[] = []
        while (peek() && peek() !== ")") all.push(unary())
        if (toks[i++] !== ")") throw new SearchQueryError('missing ")"')
        return { k: "line", all }
      }
      return { k: "term", field: name as "tag", value: unquote(field[2]) }
    }
    return { k: "term", field: "content", value: unquote(t) }
  }
  if (!toks.length) return undefined
  const n = or()
  if (i < toks.length) throw new SearchQueryError(`unexpected "${toks[i]}"`)
  return n
}

const unquote = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s)

function matchTerm(n: Extract<Node, { k: "term" }>, doc: Searchable, line?: string): boolean {
  const v = fold(n.value)
  if (line !== undefined) return fold(line).includes(v)
  if (n.field === "tag") {
    const tag = v.replace(/^#/, "")
    return doc.tags.some((t) => fold(t) === tag || fold(t).startsWith(tag + "/"))
  }
  if (n.field === "path") return fold(doc.path).includes(v)
  if (n.field === "file") return fold(doc.path.split("/").pop()!).includes(v)
  return fold(doc.text).includes(v) || fold(doc.title).includes(v)
}

function matches(n: Node, doc: Searchable, line?: string): boolean {
  switch (n.k) {
    case "term":
      return matchTerm(n, doc, line)
    case "line":
      return doc.text.split("\n").some((l) => n.all.every((x) => matches(x, doc, l)))
    case "not":
      return !matches(n.n, doc, line)
    case "and":
      return matches(n.a, doc, line) && matches(n.b, doc, line)
    case "or":
      return matches(n.a, doc, line) || matches(n.b, doc, line)
  }
}

/** Words a reader would look for in the snippet: the positive content terms. */
function terms(n: Node, negated = false): string[] {
  if (n.k === "term") return !negated && (n.field === "content" || n.field === "line") ? [n.value] : []
  if (n.k === "line") return n.all.flatMap((x) => terms(x, negated))
  if (n.k === "not") return terms(n.n, !negated)
  return [...terms(n.a, negated), ...terms(n.b, negated)]
}

export interface Hit {
  doc: Searchable
  /** First line holding a searched word, if any. */
  snippet?: string
  words: string[]
}

export function search(query: Node, docs: Searchable[]): Hit[] {
  const words = terms(query).filter(Boolean)
  return docs
    .filter((d) => matches(query, d))
    .map((doc) => {
      const snippet = words.length ? doc.text.split("\n").find((l) => words.some((w) => fold(l).includes(fold(w)))) : undefined
      return { doc, snippet: snippet?.trim(), words }
    })
}

/** HTML of a snippet with the searched words marked, accents and case ignored. */
export function highlight(raw: string, words: string[]): string {
  const text = raw.normalize("NFC")
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const folded = fold(text)
  const marks: [number, number][] = []
  for (const w of words.map(fold).filter(Boolean)) {
    for (let at = folded.indexOf(w); at >= 0; at = folded.indexOf(w, at + w.length)) marks.push([at, at + w.length])
  }
  marks.sort((a, b) => a[0] - b[0])
  let out = ""
  let pos = 0
  for (const [s, e] of marks) {
    if (s < pos) continue
    out += escape(text.slice(pos, s)) + `<mark>${escape(text.slice(s, e))}</mark>`
    pos = e
  }
  // NFD folding keeps one character per character for Latin and Vietnamese text, so offsets line up.
  return out + escape(text.slice(pos))
}
