/**
 * Pandoc-style citations, `[@key]`, `[@key, p. 12]`, `[see @a; @b]` and
 * `[-@key]`, resolved against BibTeX files and rendered author–date, with
 * the references the note cites listed at its end.
 */

export interface BibEntry {
  key: string
  type: string
  fields: Record<string, string>
}

// ---------- BibTeX ----------

/** Accents written the LaTeX way, as most reference managers export them. */
const ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý", c: "ć", n: "ń", s: "ś", z: "ź", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" },
  "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È" },
  "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", O: "Ô" },
  '"': { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", y: "ÿ", A: "Ä", O: "Ö", U: "Ü" },
  "~": { a: "ã", n: "ñ", o: "õ", A: "Ã", N: "Ñ", O: "Õ" },
  c: { c: "ç", C: "Ç" },
  v: { c: "č", s: "š", z: "ž", r: "ř", e: "ě", C: "Č", S: "Š", Z: "Ž" },
}
const SYMBOLS: Record<string, string> = { ss: "ß", o: "ø", O: "Ø", ae: "æ", AE: "Æ", aa: "å", AA: "Å", l: "ł", L: "Ł", i: "ı" }

/** Plain text of a BibTeX value: accents decoded, braces and escapes dropped. */
export function latexText(v: string): string {
  return v
    .replace(/\\([`'^"~cv])\s*\{?\\?([a-zA-Z])\}?/g, (_, acc: string, ch: string) => ACCENTS[acc]?.[ch] ?? ch)
    .replace(/\\(ss|ae|AE|aa|AA|o|O|l|L|i)\b\s*/g, (_, s: string) => SYMBOLS[s])
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/--/g, "–")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Entries of a BibTeX file; comments, preambles and malformed entries are skipped. */
export function parseBibtex(src: string): BibEntry[] {
  const entries: BibEntry[] = []
  const strings: Record<string, string> = {}
  let i = 0
  const skipSpace = () => {
    while (i < src.length && /[\s,]/.test(src[i])) i++
  }
  /** A braced or quoted value, or a bare word; `#` joins parts. */
  const value = (): string => {
    let out = ""
    for (;;) {
      skipSpace()
      if (src[i] === "{") {
        let depth = 0
        const start = i + 1
        for (; i < src.length; i++) {
          if (src[i] === "{") depth++
          else if (src[i] === "}" && --depth === 0) break
        }
        out += src.slice(start, i++)
      } else if (src[i] === '"') {
        const start = ++i
        let depth = 0
        for (; i < src.length; i++) {
          if (src[i] === "{") depth++
          else if (src[i] === "}") depth--
          else if (src[i] === '"' && depth === 0) break
        }
        out += src.slice(start, i++)
      } else {
        const word = src.slice(i).match(/^[^\s,#}]+/)?.[0] ?? ""
        i += word.length
        out += strings[word.toLowerCase()] ?? word
      }
      skipSpace()
      if (src[i] !== "#") return out
      i++
    }
  }
  while ((i = src.indexOf("@", i)) >= 0) {
    const head = src.slice(i).match(/^@(\w+)\s*[{(]/)
    if (!head) {
      i++
      continue
    }
    const type = head[1].toLowerCase()
    i += head[0].length
    if (type === "comment" || type === "preamble") continue
    if (type === "string") {
      skipSpace()
      const name = src.slice(i).match(/^[\w-]+/)?.[0] ?? ""
      i += name.length
      skipSpace()
      if (src[i] === "=") i++
      strings[name.toLowerCase()] = value()
      continue
    }
    const key = src.slice(i).match(/^[^\s,]+/)?.[0]
    if (!key) continue
    i += key.length
    const fields: Record<string, string> = {}
    for (;;) {
      skipSpace()
      if (i >= src.length || src[i] === "}" || src[i] === ")") break
      const name = src.slice(i).match(/^[\w-]+/)?.[0]
      if (!name) break
      i += name.length
      skipSpace()
      if (src[i] !== "=") break
      i++
      fields[name.toLowerCase()] = latexText(value())
    }
    entries.push({ key, type, fields })
  }
  return entries
}

// ---------- formatting ----------

interface Person {
  family: string
  given: string
}

/** BibTeX names: "Family, Given" or "Given Family", joined by "and". */
export function people(v: string | undefined): Person[] {
  if (!v) return []
  return v
    .split(/\s+and\s+/)
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => {
      if (n.includes(",")) {
        const [family, given = ""] = n.split(",", 2).map((s) => s.trim())
        return { family, given }
      }
      const parts = n.split(/\s+/)
      return { family: parts.pop()!, given: parts.join(" ") }
    })
}

const year = (e: BibEntry) => e.fields.year ?? e.fields.date?.slice(0, 4) ?? "n.d."

/** "Luhmann", "Luhmann & Habermas", "Luhmann et al.", or the title for anonymous works. */
export function shortAuthors(e: BibEntry): string {
  const ps = people(e.fields.author ?? e.fields.editor)
  if (!ps.length) return e.fields.title ?? e.key
  if (ps.length === 1) return ps[0].family
  if (ps.length === 2) return `${ps[0].family} & ${ps[1].family}`
  return `${ps[0].family} et al.`
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const initials = (given: string) =>
  given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((g) => g[0].toUpperCase() + ".")
    .join(" ")

/** A reference in an APA-like style, as HTML. */
export function formatReference(e: BibEntry): string {
  const f = e.fields
  const ps = people(f.author ?? f.editor)
  const names = ps.map((p) => (p.given ? `${p.family}, ${initials(p.given)}` : p.family))
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")}, & ${names.at(-1)}` : (names[0] ?? "")
  const title = f.title ? escape(f.title) : ""
  const container = f.journal ?? f.journaltitle ?? f.booktitle
  const parts: string[] = []
  // An anonymous work is listed by its title.
  parts.push(`${escape(who || title)} (${escape(year(e))}).`)
  if (who && title) parts.push(container ? `${title}.` : `<em>${title}</em>.`)
  if (container) {
    const vol = f.volume ? `, <em>${escape(f.volume)}</em>${f.number ? `(${escape(f.number)})` : ""}` : ""
    parts.push(`<em>${escape(container)}</em>${vol}${f.pages ? `, ${escape(f.pages)}` : ""}.`)
  }
  if (f.publisher) parts.push(`${escape(f.publisher)}.`)
  const link = f.doi ? `https://doi.org/${f.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}` : f.url
  if (link && /^https?:\/\//.test(link)) parts.push(`<a href="${escape(link)}">${escape(link)}</a>`)
  return parts.join(" ")
}

// ---------- citations in notes ----------

export interface Cited {
  md: string
  /** Keys cited, in order of first citation. */
  keys: string[]
  /** Keys cited but missing from the bibliography. */
  missing: string[]
}

/**
 * One reference inside brackets: an optional prefix ending in a space, -@key,
 * and an optional locator after a comma. As in Pandoc, @ starts a word, so
 * an e-mail address in brackets is no citation.
 */
const ITEM = /^((?:.*\s)?)(-?)@([\w:.#$%&+?<>~/-]+?)(?:,\s*(.*))?$/s

/**
 * Replace bracketed citations of a note's markdown with author–date links and
 * append the list of references. Code blocks and spans are left alone.
 */
export function cite(md: string, bib: Map<string, BibEntry>, heading: string): Cited {
  const keys: string[] = []
  const missing: string[] = []
  const lines = md.split("\n")
  let fence: string | undefined
  const out = lines.map((line) => {
    const f = line.match(/^\s*(`{3,}|~{3,})/)
    if (f && (!fence || f[1].startsWith(fence))) {
      fence = fence ? undefined : f[1]
      return line
    }
    if (fence) return line
    // Inline code is kept aside while citations are replaced around it.
    const code: string[] = []
    const masked = line.replace(/(`+)[^`]*?\1/g, (m) => `\u0002${code.push(m) - 1}\u0002`)
    const replaced = masked.replace(/\[([^\[\]]*?-?@[^\[\]]+?)\](?![(:])/g, (whole, inner: string) => {
      const items = inner.split(";").map((s) => s.trim().match(ITEM))
      if (items.some((m) => !m)) return whole
      const rendered = items.map((m) => {
        const [, prefix, suppress, key, locator] = m!
        const entry = bib.get(key)
        if (!entry) {
          if (!missing.includes(key)) missing.push(key)
          return `<span class="citation-missing">@${escape(key)}</span>`
        }
        if (!keys.includes(key)) keys.push(key)
        const text = `${suppress ? "" : `${escape(shortAuthors(entry))} `}${escape(year(entry))}${locator ? `, ${escape(locator.trim())}` : ""}`
        return `${prefix.trim() ? `${escape(prefix.trim())} ` : ""}<a href="#ref-${encodeURIComponent(key)}" class="citation">${text}</a>`
      })
      return `<cite class="citations">(${rendered.join("; ")})</cite>`
    })
    return replaced.replace(/\u0002(\d+)\u0002/g, (_, n) => code[Number(n)])
  })
  let result = out.join("\n")
  if (keys.length) {
    const sorted = keys
      .map((k) => bib.get(k)!)
      .sort((a, b) => shortAuthors(a).localeCompare(shortAuthors(b)) || year(a).localeCompare(year(b)))
    const items = sorted.map((e) => `<li id="ref-${escape(encodeURIComponent(e.key))}">${formatReference(e)}</li>`).join("")
    result += `\n\n<section class="references"><h2 id="cited-references">${escape(heading)}</h2><ol>${items}</ol></section>\n`
  }
  return { md: result, keys, missing }
}
