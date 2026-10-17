/**
 * Topic map: notes grouped by what they are about, from the embeddings that
 * related notes already compute (`related.semantic`). Each group is named
 * after the tag most of its notes share, or else its most central note.
 * Deterministic: the same notes give the same topics on every build.
 */
import { site, type Lang } from "../site.config"
import { getVault, listed, type Note } from "./vault"
import { embed } from "./embeddings"
import { aboutText } from "./related"

export interface TopicItem {
  key: string
  title: string
  tags: string[]
  vector: number[]
}

export interface Topic<T extends TopicItem = TopicItem> {
  label: string
  /** Most central first. */
  items: T[]
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)

function normalize(v: number[]): number[] {
  const n = Math.hypot(...v)
  return n ? v.map((x) => x / n) : v
}

/** How many topics a number of notes splits into, unless the config says. */
export const topicCount = (notes: number) => Math.max(2, Math.min(12, Math.round(Math.sqrt(notes / 2))))

/** Share of a topic's notes a tag must be on to name it. */
const TAG_SHARE = 0.4

/**
 * Group unit vectors into k topics by cosine k-means. Seeds are picked
 * farthest-first from the first item by key, so the result never varies.
 */
export function clusterTopics<T extends TopicItem>(items: T[], k: number, typePrefix = "type/"): Topic<T>[] {
  const sorted = [...items].sort((a, b) => a.key.localeCompare(b.key))
  k = Math.min(k, sorted.length)
  if (k < 2) return sorted.length ? [{ label: sorted[0].title, items: sorted }] : []
  const centroids: number[][] = [sorted[0].vector]
  while (centroids.length < k) {
    let far = sorted[0]
    let farthest = Infinity
    for (const it of sorted) {
      const near = Math.max(...centroids.map((c) => dot(c, it.vector)))
      if (near < farthest) (farthest = near), (far = it)
    }
    centroids.push(far.vector)
  }
  let assign = new Array<number>(sorted.length).fill(-1)
  for (let round = 0; round < 50; round++) {
    const next = sorted.map((it) => {
      let best = 0
      for (let c = 1; c < k; c++) if (dot(centroids[c], it.vector) > dot(centroids[best], it.vector)) best = c
      return best
    })
    if (next.every((c, i) => c === assign[i])) break
    assign = next
    for (let c = 0; c < k; c++) {
      const members = sorted.filter((_, i) => assign[i] === c)
      if (members.length) centroids[c] = normalize(members[0].vector.map((_, d) => members.reduce((s, m) => s + m.vector[d], 0)))
    }
  }
  const topics: Topic<T>[] = []
  for (let c = 0; c < k; c++) {
    const members = sorted.filter((_, i) => assign[i] === c).sort((a, b) => dot(centroids[c], b.vector) - dot(centroids[c], a.vector))
    if (!members.length) continue
    const counts = new Map<string, number>()
    for (const m of members) for (const t of new Set(m.tags)) if (!t.startsWith(typePrefix)) counts.set(t, (counts.get(t) ?? 0) + 1)
    const [tag, n] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? ["", 0]
    topics.push({ label: members.length > 1 && n >= Math.max(2, members.length * TAG_SHARE) ? `#${tag}` : members[0].title, items: members })
  }
  // Two topics may land on the same tag: tell them apart by their central notes.
  const seen = new Map<string, number>()
  for (const t of topics) seen.set(t.label, (seen.get(t.label) ?? 0) + 1)
  for (const t of topics) if (seen.get(t.label)! > 1) t.label = `${t.label} · ${t.items[0].title}`
  return topics.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label))
}

type NoteItem = TopicItem & { note: Note }
const cache = new Map<string, Promise<Topic<NoteItem>[]>>()

/** The topics of a language's listed notes; none without related.semantic or with `topics: false`. */
export function topics(lang: Lang): Promise<Topic<NoteItem>[]> {
  const semantic = site.related.semantic
  const count = site.topics
  if (!semantic || count === false) return Promise.resolve([])
  const id = `${getVault().version}:${lang}`
  let hit = cache.get(id)
  if (!hit) {
    hit = (async () => {
      const notes = listed(lang).filter((n) => !n.isHome && !n.protected)
      const vectors = await embed(notes.map((n) => ({ id: n.key, text: aboutText(n) })), semantic.model)
      const items = notes.flatMap((n) => {
        const v = vectors.get(n.key)
        return v ? [{ key: n.key, title: n.title, tags: n.tags, vector: v, note: n }] : []
      })
      return clusterTopics(items, count === true ? topicCount(items.length) : count, site.conventions.typePrefix)
    })()
    // Without the model, no topics this build; the next one tries again.
    hit = hit.catch(() => (cache.delete(id), []))
    cache.set(id, hit)
  }
  return hit
}

/** The topic label of each note of a language, by key. */
export async function topicOf(lang: Lang): Promise<Map<string, string>> {
  return new Map((await topics(lang)).flatMap((t) => t.items.map((i) => [i.key, t.label] as const)))
}
