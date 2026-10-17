/**
 * The notes of a language as the browser reads them: the content index for
 * search and popovers, and a slim graph index of the same notes without their
 * text, for the graph, walks and random notes on every page.
 */
import { site, type Lang } from "../site.config"
import { getVault, listed } from "./vault"
import { renderNote } from "./markdown"
import { topicOf } from "./topics"

/** A note in the graph index. */
export interface GraphEntry {
  u: string
  t: string
  a: string[]
  g: string[]
  s: string | null
  st: string
  tp: string
  f: string
  p: string
  y: string[]
  k: number | null
  m: number | null
}

/** A note in the content index: the graph's fields, its description and text. */
export interface ContentEntry extends GraphEntry {
  d: string
  c: string
}

export interface NoteIndex<E> {
  notes: E[]
  links: [number, number][]
}

/** Every listed note of a language and the links between them, with their text when `text` is set. */
export async function noteIndex(lang: Lang, text: true): Promise<NoteIndex<ContentEntry>>
export async function noteIndex(lang: Lang, text: false): Promise<NoteIndex<GraphEntry>>
export async function noteIndex(lang: Lang, text: boolean): Promise<NoteIndex<GraphEntry | ContentEntry>> {
  const vault = getVault()
  const notes = listed(lang)
  const index = new Map(notes.map((n, i) => [n.key, i]))
  const folders = vault.folders[lang]
  const topic = await topicOf(lang)
  const entries = await Promise.all(
    notes.map(async (n) => {
      const r = await renderNote(n)
      const entry: ContentEntry = {
        u: n.url,
        t: r.h1 && n.isHome ? r.h1 : n.title,
        a: n.aliases,
        g: n.tags,
        s: n.stage ? site.stages[n.stage].icon : null,
        // Stage label, for the stage filter and graph colours.
        st: n.stage ? site.stages[n.stage].label[lang] : "",
        // Topic from the embeddings, for the graph's colours; "" without one.
        tp: topic.get(n.key) ?? "",
        f: folders.get(n.dir)?.name ?? "",
        p: n.dir.split("/")[0],
        y: n.types,
        d: r.description,
        // Day the note was planted, for the graph's time slider.
        k: n.created ? Math.floor(n.created.getTime() / 86_400_000) : null,
        // Day the note was last tended, for its freshness.
        m: (n.updated ?? n.created) ? Math.floor((n.updated ?? n.created)!.getTime() / 86_400_000) : null,
        // Pagefind searches the pages themselves; the graph and filters only need the rest.
        c: site.search.engine === "pagefind" ? "" : r.text.slice(0, 6000),
      }
      if (text) return entry
      const { d: _d, c: _c, ...slim } = entry
      return slim
    }),
  )
  const links: [number, number][] = []
  const seen = new Set<string>()
  for (const n of notes) {
    // A protected note's links are part of its secret content.
    for (const l of n.protected ? [] : n.links) {
      const a = index.get(n.key)!
      const b = index.get(l.key)
      const id = `${Math.min(a, b ?? -1)}-${Math.max(a, b ?? -1)}`
      if (b == null || a === b || seen.has(id)) continue
      seen.add(id)
      links.push([a, b])
    }
  }
  return { notes: entries, links }
}

/** An index as the JSON file the browser fetches. */
export const indexResponse = (index: NoteIndex<GraphEntry>) =>
  new Response(JSON.stringify(index), { headers: { "content-type": "application/json; charset=utf-8" } })
