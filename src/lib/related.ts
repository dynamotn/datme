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

/**
 * Whole words of a text, folded as a case-insensitive regex compares letters:
 * upper then lower maps ϐ to β and ſ to s, and final sigma is one letter.
 */
const words = (s: string) =>
  s
    .toUpperCase()
    .toLowerCase()
    .replaceAll("ς", "σ")
    .match(/[\p{L}\p{N}]+/gu) ?? []

/** What a note is about, for its embedding: title, description and the start of its text. */
export const aboutText = (n: Note) => [n.title, n.description ?? "", plain(n.md)].join("\n").slice(0, 2000)

/** What ranking needs of a note. */
export type RankedNote = Pick<Note, "key" | "title" | "tags">

export type Ranked<N> = Omit<Related, "note"> & { note: N }

/**
 * The best suggestions for each note: shared tags (2 each, 0.5 for a type
 * tag), shared link targets and linking notes (1 each) and, with semantic
 * suggestions, closeness in meaning. `out` holds each note's link targets.
 *
 * Without semantic suggestions only notes sharing a tag or a link can score,
 * so each note is compared with those alone, found through indexes, instead
 * of with every other note. They are visited in the notes' order, so ties
 * rank as they would comparing every pair.
 */
export function rankRelated<N extends RankedNote>(
  notes: N[],
  out: Map<string, Set<string>>,
  opts: { lang: string; count: number; typePrefix: string; semantic?: { threshold: number; vectors: Map<string, number[]> } },
): Map<string, Ranked<N>[]> {
  const { lang, typePrefix, semantic } = opts
  const inbound = new Map<string, Set<string>>()
  for (const [from, targets] of out) for (const to of targets) inbound.set(to, (inbound.get(to) ?? new Set()).add(from))
  const index = new Map(notes.map((n, i) => [n.key, i]))
  const byTag = new Map<string, number[]>()
  notes.forEach((n, i) => {
    for (const t of new Set(n.tags)) {
      const list = byTag.get(t)
      if (list) list.push(i)
      else byTag.set(t, [i])
    }
  })

  /** The notes sharing a tag, a link target or a linking note with `a`, in the notes' order. */
  function candidates(a: N): N[] {
    const found = new Set<number>()
    const add = (key: string) => {
      const i = index.get(key)
      if (i !== undefined) found.add(i)
    }
    for (const t of a.tags) for (const i of byTag.get(t) ?? []) found.add(i)
    for (const k of out.get(a.key)!) for (const from of inbound.get(k) ?? []) add(from)
    for (const k of inbound.get(a.key) ?? []) for (const to of out.get(k) ?? []) add(to)
    return [...found].sort((x, y) => x - y).map((i) => notes[i])
  }

  const related = new Map<string, Ranked<N>[]>()
  for (const a of notes) {
    const scored: Ranked<N>[] = []
    // Closeness in meaning can relate any two notes, so then every pair is compared.
    for (const b of semantic ? notes : candidates(a)) {
      if (a === b) continue
      // Notes already linked to each other are not suggestions.
      if (out.get(a.key)!.has(b.key) || out.get(b.key)!.has(a.key)) continue
      const tags = a.tags.filter((t) => b.tags.includes(t))
      const tagScore = tags.reduce((s, t) => s + (t.startsWith(typePrefix) ? 0.5 : 2), 0)
      let links = 0
      for (const k of out.get(a.key)!) if (out.get(b.key)!.has(k)) links++
      for (const k of inbound.get(a.key) ?? []) if (inbound.get(b.key)?.has(k)) links++
      // Closeness in meaning counts from the threshold up: 2 there, 6 for the same text.
      const va = semantic?.vectors.get(a.key)
      const vb = semantic?.vectors.get(b.key)
      const sim = va && vb && semantic ? cosine(va, vb) : 0
      const semScore = semantic && sim >= semantic.threshold ? 2 + (4 * (sim - semantic.threshold)) / (1 - semantic.threshold || 1) : 0
      const score = tagScore + links + semScore
      if (score >= 2) {
        scored.push({ note: b, score, tags: tags.filter((t) => !t.startsWith(typePrefix)), links, ...(semScore ? { similarity: sim } : {}) })
      }
    }
    scored.sort((x, y) => y.score - x.score || x.note.title.localeCompare(y.note.title, lang))
    related.set(a.key, scored.slice(0, opts.count))
  }
  return related
}

/** Related notes and mentions of a language, computed afresh (data() caches them per build). */
export async function computeRelated(lang: Lang) {
  const vault = getVault()
  const notes = vault.notes[lang].filter((n) => !n.isHome && !n.unlisted)
  const semantic = site.related.semantic
  // Protected notes have no text to compare, and must not reveal any.
  const vectors = semantic
    ? await embed(
        notes.filter((n) => !n.protected).map((n) => ({ id: n.key, text: aboutText(n) })),
        semantic.model,
      )
    : new Map<string, number[]>()
  const linksOf = (n: Note) => new Set(n.protected ? [] : n.links.map((l) => l.key))
  const out = new Map(notes.map((n) => [n.key, linksOf(n)]))
  const related = rankRelated(notes, out, {
    lang,
    count: site.related.count,
    typePrefix: site.conventions.typePrefix,
    ...(semantic ? { semantic: { threshold: semantic.threshold, vectors } } : {}),
  })

  const mentions = new Map<string, Mention[]>()
  const texts = new Map(notes.filter((n) => !n.protected).map((n) => [n.key, plain(n.md)]))
  // The notes holding each word: a whole-word mention needs every word of the name, so the
  // regex runs only on notes holding its rarest one instead of on every note.
  const holders = new Map<string, Set<string>>()
  for (const [key, text] of texts) {
    for (const w of words(text)) {
      if (!holders.has(w)) holders.set(w, new Set())
      holders.get(w)!.add(key)
    }
  }
  for (const target of notes) {
    const names = [...new Set([target.title, ...target.aliases].map((s) => s.trim()).filter((s) => s.length >= 4))]
    if (!names.length) continue
    // Whole words only, so "Git" does not match inside "GitLab" and diacritics count as letters.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "iu")
    const rarest = names.map(
      (n) =>
        words(n)
          .map((w) => holders.get(w) ?? new Set<string>())
          .sort((a, b) => a.size - b.size)[0],
    )
    const candidates = rarest.every(Boolean) ? new Set(rarest.flatMap((s) => [...s])) : undefined
    const found: Mention[] = []
    for (const source of notes) {
      if (source === target || source.protected || out.get(source.key)!.has(target.key)) continue
      if (candidates && !candidates.has(source.key)) continue
      const text = texts.get(source.key)!
      const m = re.exec(text)
      if (!m) continue
      const start = Math.max(0, m.index - 70)
      const end = Math.min(text.length, m.index + m[0].length + 70)
      found.push({ note: source, context: (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "") })
    }
    mentions.set(
      target.key,
      found.sort((x, y) => x.note.title.localeCompare(y.note.title, lang)),
    )
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
