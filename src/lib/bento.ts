import { site, type Lang } from "../site.config"
import { byRecent, getVault, listed, type Note } from "./vault"

/** How many notes the recent and stream tiles list, and how many tags the tags tile shows. */
const RECENT = 6
const STREAM = 4
const TAGS = 12

/** What the tiles of a bento home show in one language; a tile with nothing to show is left out. */
export interface Bento {
  /** The most recently updated note with `layout: now`. */
  now?: Note
  recent: Note[]
  /** The note with the most links in and out, at the centre of the graph tile. */
  hub?: Note
  /** The newest notes of the `appearance.stream` folders, and the folder page to read them all. */
  stream: Note[]
  streamUrl?: string
  /** The most used tags and how many listed notes carry each. */
  tags: { tag: string; count: number }[]
}

export function bentoOf(lang: Lang): Bento {
  const vault = getVault()
  // Folder notes introduce their folder, which has a page of its own.
  const notes = listed(lang).filter((n) => !n.isHome && n.source.stem !== n.dir.split("/").at(-1))
  const now = byRecent(notes.filter((n) => n.layout === "now"))[0]
  const recent = byRecent(notes.filter((n) => n !== now)).slice(0, RECENT)
  const degree = (n: Note) => n.links.length + (vault.backlinks[lang].get(n.key)?.length ?? 0)
  const hub = notes.reduce<Note | undefined>((best, n) => (degree(n) > (best ? degree(best) : 0) ? n : best), undefined)
  const folders = site.appearance.stream
  const inStream = (n: Note) => folders.some((f) => n.dir === f || n.dir.startsWith(f + "/"))
  const stream = byRecent(notes.filter(inStream), "created").slice(0, STREAM)
  const streamUrl = folders.length === 1 ? vault.folders[lang].get(folders[0])?.url : undefined
  const shown = new Set(notes)
  const tags = [...vault.tags[lang]]
    .map(([tag, tagged]) => ({ tag, count: tagged.filter((n) => shown.has(n)).length }))
    .filter((t) => t.count)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, TAGS)
  return { now, recent, hub, stream, streamUrl, tags }
}
