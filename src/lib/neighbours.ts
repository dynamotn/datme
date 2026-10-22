/**
 * Links between gardens: `neighbours` in datme.yaml names other datme
 * gardens, and `[[name:Note]]` links to a note of one of them. Their public
 * content index is fetched before the build and kept in the build cache, so
 * notes convert without the network, and a build offline uses the last copy.
 */
import fs from "node:fs"
import path from "node:path"
import { basePath, withBase } from "./base.ts"

export const NEIGHBOURS_FILE = "neighbours.json"

/** A note of another garden: its URL path, title and aliases, as its content index lists them. */
interface Remote {
  u: string
  t: string
  a?: string[]
}

export interface NeighbourIndex {
  url: string
  /** When it was fetched, in ms. */
  fetchedAt: number
  /** Its notes by language. */
  notes: Record<string, Remote[]>
}

type Store = Record<string, NeighbourIndex>

/** The syntax: a garden's name, a colon, then the note as a wikilink would name it. */
export const GARDEN_LINK = /^([\w-]+):(.+)$/

/** The cached indexes of the neighbours. DATME_NEIGHBOURS names the file, set by the CLI. */
let loaded: { file: string; store: Store } | undefined
function store(file = process.env.DATME_NEIGHBOURS): Store {
  if (!file) return {}
  if (loaded?.file !== file) {
    try {
      loaded = { file, store: JSON.parse(fs.readFileSync(file, "utf8")) }
    } catch {
      loaded = { file, store: {} }
    }
  }
  return loaded.store
}

const fold = (s: string) => s.normalize("NFC").toLowerCase()

/**
 * A note of a neighbour garden by title, alias or path, in a language (or
 * any language it has). undefined when the garden's index is unknown, null
 * when it is known and has no such note.
 */
export function findInGarden(name: string, target: string, lang: string, file?: string): { url: string; title: string } | null | undefined {
  const garden = store(file)[name]
  if (!garden) return undefined
  const want = fold(target.replace(/\.md$/i, "").trim())
  const lists = [
    garden.notes[lang] ?? [],
    ...Object.entries(garden.notes)
      .filter(([l]) => l !== lang)
      .map(([, n]) => n),
  ]
  for (const notes of lists) {
    const hit =
      notes.find((n) => fold(n.t) === want) ??
      notes.find((n) => n.a?.some((a) => fold(a) === want)) ??
      notes.find((n) => {
        let p = n.u
        try {
          p = decodeURI(p)
        } catch {
          // keep it raw
        }
        const tail = fold(p.replace(/\/+$/, ""))
        return tail.endsWith("/" + want.replace(/ /g, "-")) || tail.endsWith("/" + want)
      })
    if (hit) return { url: remoteUrl(hit.u, garden.url), title: hit.t }
  }
  return null
}

/**
 * The full URL of a note of a garden from its index. A garden served under a
 * path lists its notes under it, unless it was built before datme knew of
 * paths: those are put under it.
 */
function remoteUrl(u: string, gardenUrl: string): string {
  const base = basePath(gardenUrl)
  return new URL(u.startsWith(base) ? u : withBase(u, base), gardenUrl + "/").href
}

/** Fetch a URL as JSON within a few seconds, or undefined. */
async function getJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } })
    return r.ok ? await r.json() : undefined
  } catch {
    return undefined
  }
}

/** The language of a garden's home page, to find its index when it does not share ours. */
async function homeLang(url: string): Promise<string | undefined> {
  try {
    const r = await fetch(url + "/", { signal: AbortSignal.timeout(10_000) })
    return (await r.text()).match(/<html[^>]*\blang="([^"]+)"/)?.[1]
  } catch {
    return undefined
  }
}

/**
 * Fetch the content index of every neighbour, in each of our languages and
 * in the garden's own, and write them to the cache file. A garden that cannot
 * be reached keeps its last copy. Returns what could not be fetched.
 */
export async function fetchNeighbours(neighbours: Record<string, string>, langs: string[], file: string, now = Date.now()): Promise<string[]> {
  const old = store(file)
  const next: Store = {}
  const failed: string[] = []
  await Promise.all(
    Object.entries(neighbours).map(async ([name, url]) => {
      const notes: Record<string, Remote[]> = {}
      const tryLang = async (lang: string) => {
        const data = (await getJson(`${url}/static/contentIndex.${lang}.json`)) as { notes?: Remote[] } | undefined
        if (Array.isArray(data?.notes)) notes[lang] = data.notes.map((n) => ({ u: n.u, t: n.t, ...(n.a?.length ? { a: n.a } : {}) }))
      }
      await Promise.all(langs.map(tryLang))
      if (!Object.keys(notes).length) {
        const own = await homeLang(url)
        if (own) await tryLang(own)
      }
      if (Object.keys(notes).length) next[name] = { url, fetchedAt: now, notes }
      else {
        failed.push(name)
        if (old[name]?.url === url) next[name] = old[name]
      }
    }),
  )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next))
  loaded = undefined
  return failed.sort()
}
