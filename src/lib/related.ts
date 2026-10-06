import { site, type Lang } from "../site.config"
import { getVault, type Note } from "./vault"

export interface Related {
  note: Note
  score: number
  /** Why the notes are related: shared tags and shared links. */
  tags: string[]
  links: number
}

export interface Mention {
  note: Note
  /** The words around the first unlinked mention. */
  context: string
}

const cache = new Map<string, { related: Map<string, Related[]>; mentions: Map<string, Mention[]> }>()

/** Plain text of a note's markdown, without HTML, links' targets or markup. */
function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_=`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function compute(lang: Lang) {
  const vault = getVault()
  const notes = vault.notes[lang].filter((n) => !n.isHome && !n.unlisted)
  const linksOf = (n: Note) => new Set(n.protected ? [] : n.links.map((l) => l.key))
  const out = new Map(notes.map((n) => [n.key, linksOf(n)]))
  const inbound = new Map<string, Set<string>>()
  for (const [from, targets] of out) for (const to of targets) inbound.set(to, (inbound.get(to) ?? new Set()).add(from))
  const typePrefix = site.conventions.typePrefix

  const related = new Map<string, Related[]>()
  for (const a of notes) {
    const scored: Related[] = []
    for (const b of notes) {
      if (a === b) continue
      // Notes already linked to each other are not suggestions.
      if (out.get(a.key)!.has(b.key) || out.get(b.key)!.has(a.key)) continue
      const tags = a.tags.filter((t) => b.tags.includes(t))
      const tagScore = tags.reduce((s, t) => s + (t.startsWith(typePrefix) ? 0.5 : 2), 0)
      let links = 0
      for (const k of out.get(a.key)!) if (out.get(b.key)!.has(k)) links++
      for (const k of inbound.get(a.key) ?? []) if (inbound.get(b.key)?.has(k)) links++
      const score = tagScore + links
      if (score >= 2) scored.push({ note: b, score, tags: tags.filter((t) => !t.startsWith(typePrefix)), links })
    }
    scored.sort((x, y) => y.score - x.score || x.note.title.localeCompare(y.note.title, lang))
    related.set(a.key, scored.slice(0, site.related.count))
  }

  const mentions = new Map<string, Mention[]>()
  const texts = new Map(notes.filter((n) => !n.protected).map((n) => [n.key, plain(n.md)]))
  for (const target of notes) {
    const names = [...new Set([target.title, ...target.aliases].map((s) => s.trim()).filter((s) => s.length >= 4))]
    if (!names.length) continue
    // Whole words only, so "Git" does not match inside "GitLab" and diacritics count as letters.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "iu")
    const found: Mention[] = []
    for (const source of notes) {
      if (source === target || source.protected || out.get(source.key)!.has(target.key)) continue
      const text = texts.get(source.key)!
      const m = re.exec(text)
      if (!m) continue
      const start = Math.max(0, m.index - 70)
      const end = Math.min(text.length, m.index + m[0].length + 70)
      found.push({ note: source, context: (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "") })
    }
    mentions.set(target.key, found.sort((x, y) => x.note.title.localeCompare(y.note.title, lang)))
  }
  return { related, mentions }
}

function data(lang: Lang) {
  const id = `${getVault().version}:${lang}`
  let hit = cache.get(id)
  if (!hit) {
    hit = compute(lang)
    cache.set(id, hit)
  }
  return hit
}

/** Notes sharing tags or links with this one, best first, excluding those already linked. */
export function relatedNotes(note: Note): Related[] {
  return site.related.count > 0 ? (data(note.lang).related.get(note.key) ?? []) : []
}

/** Notes that name this one (title or alias) without linking to it. */
export function unlinkedMentions(note: Note): Mention[] {
  return site.related.mentions ? (data(note.lang).mentions.get(note.key) ?? []) : []
}
