import { site, type Lang } from "../site.config"
import { getVault, type Note } from "./vault"
import { cosine, embed } from "./embeddings"

export interface Related {
  note: Note
  score: number
  /** Why the notes are related: shared tags, shared links, and how close they are in meaning. */
  tags: string[]
  links: number
  /** Cosine similarity of their embeddings, when semantic suggestions are on and it counted. */
  similarity?: number
}

export interface Mention {
  note: Note
  /** The words around the first unlinked mention. */
  context: string
}

const cache = new Map<string, Promise<{ related: Map<string, Related[]>; mentions: Map<string, Mention[]> }>>()

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

/** What a note is about, for its embedding: title, description and the start of its text. */
export const aboutText = (n: Note) => [n.title, n.description ?? "", plain(n.md)].join("\n").slice(0, 2000)

/** Related notes and mentions of a language, computed afresh (data() caches them per build). */
export async function computeRelated(lang: Lang) {
  const vault = getVault()
  const notes = vault.notes[lang].filter((n) => !n.isHome && !n.unlisted)
  const semantic = site.related.semantic
  // Protected notes have no text to compare, and must not reveal any.
  const vectors = semantic
    ? await embed(notes.filter((n) => !n.protected).map((n) => ({ id: n.key, text: aboutText(n) })), semantic.model)
    : new Map<string, number[]>()
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
      // Closeness in meaning counts from the threshold up: 2 there, 6 for the same text.
      const va = vectors.get(a.key)
      const vb = vectors.get(b.key)
      const sim = va && vb && semantic ? cosine(va, vb) : 0
      const semScore = semantic && sim >= semantic.threshold ? 2 + (4 * (sim - semantic.threshold)) / (1 - semantic.threshold || 1) : 0
      const score = tagScore + links + semScore
      if (score >= 2) {
        scored.push({ note: b, score, tags: tags.filter((t) => !t.startsWith(typePrefix)), links, ...(semScore ? { similarity: sim } : {}) })
      }
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
    hit = computeRelated(lang)
    cache.set(id, hit)
    // A failure (no model) is reported once per build, then tried again on the next.
    hit.catch(() => cache.delete(id))
  }
  return hit
}

/** Notes sharing tags or links with this one, or close in meaning, best first, excluding those already linked. */
export async function relatedNotes(note: Note): Promise<Related[]> {
  return site.related.count > 0 ? ((await data(note.lang)).related.get(note.key) ?? []) : []
}

/** Notes that name this one (title or alias) without linking to it. */
export async function unlinkedMentions(note: Note): Promise<Mention[]> {
  return site.related.mentions ? ((await data(note.lang)).mentions.get(note.key) ?? []) : []
}
