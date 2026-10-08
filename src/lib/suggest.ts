import fs from "node:fs"
import path from "node:path"
import { site, type Lang } from "../site.config"
import { getVault, parseFrontmatter, type Note } from "./vault"
import { relatedNotes } from "./related"
import { slugTag } from "./slug"

/**
 * Suggestions for the note being written, for `datme related` and the Obsidian
 * plugin: published notes related to it, and the places where its text names
 * a published note without linking to it. The note itself may be private.
 */
export interface Suggestions {
  file: string
  published: boolean
  related: { file: string; title: string; url: string; score: number; tags: string[]; links: number; similarity?: number }[]
  /** The first unlinked mention of each published note, by its offset in the file. */
  mentions: { file: string; title: string; text: string; offset: number; line: number }[]
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The text with everything that is not prose blanked out, offsets kept: code, links, tags, comments, HTML. */
export function prose(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ")
  return src
    .replace(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/, blank)
    .replace(/^(\s*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\2[^\S\n]*$/gm, blank)
    .replace(/`[^`\n]+`/g, blank)
    .replace(/%%[\s\S]*?%%|<!--[\s\S]*?-->/g, blank)
    .replace(/!?\[\[[^\]\n]*\]\]/g, blank)
    .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, blank)
    .replace(/https?:\/\/\S+/g, blank)
    .replace(/<[^>\n]+>/g, blank)
    .replace(/(^|\s)#[\p{L}_][\p{L}\p{N}_/-]*/gu, blank)
}

/** Places where a text names one of the notes without a link: the first per note, in text order. */
export function findMentions(
  src: string,
  notes: { file: string; title: string; names: string[] }[],
): Suggestions["mentions"] {
  const text = prose(src)
  const out: Suggestions["mentions"] = []
  for (const n of notes) {
    const names = [...new Set(n.names.map((s) => s.trim()).filter((s) => s.length >= 4))].sort((a, b) => b.length - a.length)
    if (!names.length) continue
    // Whole words only, so "Git" does not match inside "GitLab" and diacritics count as letters.
    const m = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "iu").exec(text)
    if (!m) continue
    out.push({ file: n.file, title: n.title, text: src.slice(m.index, m.index + m[0].length), offset: m.index, line: src.slice(0, m.index).split("\n").length })
  }
  return out.sort((a, b) => a.offset - b.offset)
}

const toList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [])

export async function suggestionsFor(rel: string, lang: Lang = site.defaultLang): Promise<Suggestions> {
  const vault = getVault()
  const file = rel.replace(/\\/g, "/").replace(/^\/+/, "")
  const src = fs.readFileSync(path.join(site.vault, file), "utf8")
  const key = file.replace(/\.md$/i, "")
  const dir = path.posix.dirname(file) === "." ? "" : path.posix.dirname(file)
  const self = vault.byKey[lang].get(key)
  const notes = vault.notes[lang].filter((n) => n.key !== key && !n.unlisted)
  // What the note links to already, published or not yet.
  const linked = new Set(
    [...src.matchAll(/\[\[([^\]|#\n]+)/g), ...src.matchAll(/\]\(([^)#\s]+\.md)/gi)].flatMap((m) => {
      let target = m[1]
      try {
        target = decodeURI(target)
      } catch {
        // keep it as written
      }
      const s = vault.resolveNote(target, dir)
      return s ? [s.key] : []
    }),
  )
  const mentions = findMentions(
    src,
    notes.filter((n) => !linked.has(n.key)).map((n) => ({ file: n.key + ".md", title: n.title, names: [n.title, n.source.stem, ...n.aliases] })),
  )
  const shown = (n: Note, r: { score: number; tags: string[]; links: number; similarity?: number }) => ({
    file: n.key + ".md",
    title: n.title,
    url: n.url,
    score: Math.round(r.score * 100) / 100,
    tags: r.tags,
    links: r.links,
    ...(r.similarity === undefined ? {} : { similarity: Math.round(r.similarity * 100) / 100 }),
  })
  let related: Suggestions["related"]
  if (self) related = (await relatedNotes(self)).map((r) => shown(r.note, r))
  else {
    // A private note is not indexed: shared tags and shared links are what is known of it.
    const { fm } = parseFrontmatter(src)
    const tags = toList(fm.tags ?? fm.tag).map((t) => slugTag(t.replace(/^#/, "")))
    const typePrefix = site.conventions.typePrefix
    related = notes
      .filter((n) => !linked.has(n.key) && !n.isHome)
      .map((n) => {
        const shared = tags.filter((t) => n.tags.includes(t))
        const links = n.protected ? 0 : n.links.filter((l) => linked.has(l.key)).length
        const score = shared.reduce((s, t) => s + (t.startsWith(typePrefix) ? 0.5 : 2), 0) + links
        return { n, score, tags: shared.filter((t) => !t.startsWith(typePrefix)), links }
      })
      .filter((r) => r.score >= 2)
      .sort((a, b) => b.score - a.score || a.n.title.localeCompare(b.n.title, lang))
      .slice(0, site.related.count || 5)
      .map((r) => shown(r.n, r))
  }
  return { file, published: !!self, related, mentions }
}

/** The report of `datme related` for people: related notes, then unlinked mentions with their line. */
export function formatSuggestions(s: Suggestions): string {
  const why = (r: Suggestions["related"][number]) =>
    [r.tags.length ? r.tags.map((t) => "#" + t).join(" ") : "", r.links ? `${r.links} shared link${r.links === 1 ? "" : "s"}` : "", r.similarity ? `≈ ${Math.round(r.similarity * 100)}%` : ""]
      .filter(Boolean)
      .join(", ")
  const lines = [`Related to ${s.file}${s.published ? "" : " (private)"}`]
  lines.push(...(s.related.length ? s.related.map((r) => `  ${r.file}  ${why(r)}`) : ["  none"]))
  lines.push("", "Named without a link")
  lines.push(...(s.mentions.length ? s.mentions.map((m) => `  line ${m.line}: "${m.text}" → [[${m.title}]]`) : ["  none"]))
  return lines.join("\n")
}
