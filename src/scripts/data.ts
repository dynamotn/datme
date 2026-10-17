import { freshness } from "./outdated"

/** A note in the graph index: what the graph, walks and random notes need. */
export interface GraphNote {
  u: string
  t: string
  a: string[]
  g: string[]
  /** Top-level folder of the note, "" at the vault root. */
  p: string
  /** Types from tags like type/book. */
  y: string[]
  /** Icon of the note's stage, if any. */
  s: string | null
  /** Label of the note's stage, "" without one. */
  st?: string
  /** Label of the note's topic, "" without one. */
  tp?: string
  f: string
  /** Day the note was created, in days since 1970; null when unknown. */
  k?: number | null
  /** Day the note was last tended, in days since 1970; null when unknown. */
  m?: number | null
}
/** A note in the content index, for search: also its description and text. */
export interface IndexNote extends GraphNote {
  d: string
  c: string
}
export interface GraphIndex<N extends GraphNote = GraphNote> {
  notes: N[]
  links: [number, number][]
}
export type ContentIndex = GraphIndex<IndexNote>

const cache = new Map<string, Promise<GraphIndex<GraphNote>>>()

function load<I>(url: string): Promise<I> {
  let hit = cache.get(url)
  if (!hit) {
    hit = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`)
      return r.json() as Promise<GraphIndex<GraphNote>>
    })
    // A failure, such as being offline, is not kept: the next call tries again.
    hit.catch(() => cache.delete(url))
    cache.set(url, hit)
  }
  return hit as Promise<I>
}

/** Every note of a language with its text: only search needs it, as it is by far the larger file. */
export const loadIndex = (lang: string) => load<ContentIndex>(`/static/contentIndex.${lang}.json`)

/** Every note of a language and their links, without their text: for the graph, walks and random notes. */
export const loadGraph = (lang: string) => load<GraphIndex>(`/static/graph.${lang}.json`)

/** Compare URL paths regardless of percent-encoding and trailing slashes. */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    try {
      p = decodeURIComponent(p)
    } catch {
      // keep as is
    }
    return p.replace(/\/+$/, "") || "/"
  }
  return norm(a) === norm(b)
}

export const currentLang = () => document.documentElement.dataset.lang ?? "vi-VN"

export interface NoteFilter {
  folder?: string
  type?: string
  tag?: string
  stage?: string
  fresh?: string
}

/** Whether a note passes every set filter; a tag also matches its nested tags. */
export function matchesFilter(n: GraphNote, f: NoteFilter): boolean {
  if (f.folder && n.p !== f.folder) return false
  if (f.type && !n.y.includes(f.type)) return false
  if (f.tag && !n.g.some((g) => g === f.tag || g.startsWith(f.tag + "/"))) return false
  if (f.stage && n.st !== f.stage) return false
  if (f.fresh && (n.m == null || freshness(n.m) !== f.fresh)) return false
  return true
}

/** Current values of the filter selects of a dialog. */
export function readFilters(root: ParentNode): NoteFilter {
  const value = (kind: string) => root.querySelector<HTMLSelectElement>(`select[data-filter="${kind}"]`)?.value || undefined
  return { folder: value("folder"), type: value("type"), tag: value("tag"), stage: value("stage"), fresh: value("fresh") }
}
