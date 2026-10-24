/**
 * The neighbourhood of each note, as its local graph draws it: the notes at
 * most two links away and the links between them, cut out of the language's
 * graph index. A note page fetches its own small file instead of the whole
 * graph, which only the global graph, walks and random notes need.
 *
 * Every file is cut from `noteIndex`, the very index graph.<lang>.json is,
 * so it follows the same rules: unlisted and unpublished notes are not in it,
 * and a protected note's own links are not either.
 */
import crypto from "node:crypto"
import type { Lang } from "../site.config"
import { listed, vaultMemo } from "./vault"
import { noteIndex, type GraphEntry, type NoteIndex } from "./note-index"
import { neighbourhood } from "../scripts/graph-hops"

/** How many links deep the files go: the deepest the local graph draws. */
export const HOOD_DEPTH = 2

/** A neighbourhood: its notes, the current one first, the links between them, and how many links each has in the whole graph. */
export interface Hood {
  notes: { u: string; t: string }[]
  links: [number, number][]
  deg: number[]
}

/** The neighbourhood of the note at `at` in an index. */
export function hoodOf(index: NoteIndex<GraphEntry>, at: number): Hood {
  const deg = new Array<number>(index.notes.length).fill(0)
  for (const [a, b] of index.links) deg[a]++, deg[b]++
  // Notes in the order they were reached: the current one first, then by distance.
  const keep = [...neighbourhood(index.links, at, HOOD_DEPTH).keys()]
  const local = new Map(keep.map((i, j) => [i, j]))
  return {
    notes: keep.map((i) => ({ u: index.notes[i].u, t: index.notes[i].t })),
    links: index.links.filter(([a, b]) => local.has(a) && local.has(b)).map(([a, b]) => [local.get(a)!, local.get(b)!]),
    deg: keep.map((i) => deg[i]),
  }
}

/** The name of a note's file: a short hash of its URL, which may hold any character. */
export const hoodId = (url: string) => crypto.createHash("sha256").update(url).digest("hex").slice(0, 16)

const listedUrls = vaultMemo<Set<string>>()
const graphs = vaultMemo<Promise<NoteIndex<GraphEntry>>>()

/** The graph index of a language, built once per build. */
export const graphOf = (lang: Lang) => graphs.get(lang, () => noteIndex(lang, false))

/** The path of a note's neighbourhood file, or undefined for a page the graph does not hold. */
export function hoodPath(lang: Lang, url: string | undefined): string | undefined {
  const urls = listedUrls.get(lang, () => new Set(listed(lang).map((n) => n.url)))
  return url && urls.has(url) ? `/static/graph/${lang}/${hoodId(url)}.json` : undefined
}
