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

/** What every neighbourhood of an index reads: each note's link count, and the links touching it, in index order. */
interface Around {
  deg: number[]
  touching: number[][]
  byUrl: Map<string, number>
}
const arounds = new WeakMap<NoteIndex<GraphEntry>, Around>()

function aroundOf(index: NoteIndex<GraphEntry>): Around {
  let around = arounds.get(index)
  if (!around) {
    const deg = new Array<number>(index.notes.length).fill(0)
    const touching = index.notes.map((): number[] => [])
    index.links.forEach(([a, b], l) => {
      deg[a]++, deg[b]++
      touching[a].push(l)
      if (b !== a) touching[b].push(l)
    })
    arounds.set(index, (around = { deg, touching, byUrl: new Map(index.notes.map((n, i) => [n.u, i])) }))
  }
  return around
}

/** The links touching some of `notes`, in index order: the only ones a walk from them can follow. */
function linksAt(index: NoteIndex<GraphEntry>, touching: number[][], notes: Iterable<number>): [number, number][] {
  const ids = new Set<number>()
  for (const i of notes) for (const l of touching[i]) ids.add(l)
  return [...ids].sort((x, y) => x - y).map((l) => index.links[l])
}

/** The neighbourhood of the note at `at` in an index. */
export function hoodOf(index: NoteIndex<GraphEntry>, at: number): Hood {
  // Each step looks only at the links of the notes reached so far: a page per note must not read every link of the vault.
  const { deg, touching } = aroundOf(index)
  let reach = new Set([at])
  for (let d = 0; d < HOOD_DEPTH; d++) reach = new Set(neighbourhood(linksAt(index, touching, reach), at, d + 1).keys())
  // Notes in the order they were reached: the current one first, then by distance.
  const keep = [...reach]
  const local = new Map(keep.map((i, j) => [i, j]))
  return {
    notes: keep.map((i) => ({ u: index.notes[i].u, t: index.notes[i].t })),
    links: linksAt(index, touching, keep)
      .filter(([a, b]) => local.has(a) && local.has(b))
      .map(([a, b]) => [local.get(a)!, local.get(b)!]),
    deg: keep.map((i) => deg[i]),
  }
}

/** The neighbourhood of the note at `url`, or undefined when the index does not hold it. */
export function hoodAt(index: NoteIndex<GraphEntry>, url: string): Hood | undefined {
  const at = aroundOf(index).byUrl.get(url)
  return at === undefined ? undefined : hoodOf(index, at)
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
