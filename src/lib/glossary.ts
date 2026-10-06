import type { Root, Element, ElementContent, Text } from "hast"
import { site, type Lang } from "../site.config"
import { getVault, listed } from "./vault"

/** A term of the glossary: the note defining it and the names it goes by. */
export interface Term {
  key: string
  url: string
  names: string[]
}

const cache = new Map<string, { terms: Term[]; pattern?: RegExp; byName: Map<string, Term> }>()

/** Notes tagged as terms (type/term), by every name they go by in a language. */
export function glossary(lang: Lang) {
  const vault = getVault()
  const id = `${vault.version}:${lang}`
  let hit = cache.get(id)
  if (hit) return hit
  const tag = site.conventions.typePrefix + "term"
  const terms: Term[] = site.glossary
    ? listed(lang)
        .filter((n) => !n.protected && n.tags.includes(tag))
        .map((n) => ({ key: n.key, url: n.url, names: [...new Set([n.title, ...n.aliases].map((x) => x.trim()).filter((x) => x.length > 1))] }))
    : []
  const byName = new Map<string, Term>()
  for (const t of terms) for (const name of t.names) byName.set(name.toLocaleLowerCase(lang), t)
  // Longest names first, so "slip box method" wins over "slip box".
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const pattern = names.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(${names.join("|")})(?![\\p{L}\\p{N}_])`, "giu") : undefined
  hit = { terms, pattern, byName }
  cache.set(id, hit)
  return hit
}

/** Names and targets of the glossary, to key cached pages that it changes. */
export function glossarySignature(lang: Lang): string {
  return glossary(lang)
    .terms.map((t) => `${t.key}=${t.url}:${t.names.join("|")}`)
    .join(";")
}

/** Where a term is never linked: links, code, headings, math and the term notes' own markup. */
const SKIP_TAGS = new Set(["a", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "script", "style", "svg", "math", "summary", "figcaption"])
const SKIP_CLASSES = ["katex", "transclude", "citation", "sidenote", "cloze", "dataview", "chart-data", "footnotes"]

/**
 * Link the first mention of each term in a note to the note that defines it.
 * `self` is the note being rendered, which never links to itself.
 */
export function linkTerms(tree: Root, lang: Lang, self: string): void {
  const { pattern, byName } = glossary(lang)
  if (!pattern) return
  const done = new Set<string>([self])
  const walk = (node: Root | Element) => {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i] as ElementContent
      if (child.type === "element") {
        const cls = (child.properties.className as string[] | undefined) ?? []
        if (!SKIP_TAGS.has(child.tagName) && !cls.some((c) => SKIP_CLASSES.includes(c))) walk(child)
        continue
      }
      if (child.type !== "text") continue
      const parts = split(child, pattern, byName, done, lang)
      if (parts.length > 1) {
        node.children.splice(i, 1, ...parts)
        i += parts.length - 1
      }
    }
  }
  walk(tree)
}

function split(text: Text, pattern: RegExp, byName: Map<string, Term>, done: Set<string>, lang: Lang): ElementContent[] {
  const out: ElementContent[] = []
  let last = 0
  pattern.lastIndex = 0
  for (let m = pattern.exec(text.value); m; m = pattern.exec(text.value)) {
    const term = byName.get(m[1].toLocaleLowerCase(lang))
    if (!term || done.has(term.key)) continue
    done.add(term.key)
    if (m.index > last) out.push({ type: "text", value: text.value.slice(last, m.index) })
    out.push({
      type: "element",
      tagName: "a",
      properties: { href: term.url, className: ["internal", "term"], dataKey: term.key },
      children: [{ type: "text", value: m[1] }],
    })
    last = m.index + m[1].length
  }
  if (!out.length) return [text]
  if (last < text.value.length) out.push({ type: "text", value: text.value.slice(last) })
  return out
}
