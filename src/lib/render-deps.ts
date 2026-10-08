import crypto from "node:crypto"
import type { Lang } from "../site.config"
import { getVault, type Note } from "./vault"
import { engineFor } from "./dataview-render"
import { parseQuery, scopeOf, type Page } from "./dataview"
import { stamp } from "./images"

/**
 * What a note that embeds others or runs queries reads from the rest of the
 * vault, as strings for the key of its cached rendering: the same strings,
 * the same page. Queries depend on the pages in their scope (a Dataview FROM
 * of tags and folders), or on every published page when the scope is not
 * known; embeds on the embedded notes, followed down. Nothing here is the
 * text of a protected note or a locked part: only hashes of what the
 * Dataview engine itself sees, which leaves both out.
 */

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex")

const memo = new Map<string, string>()
function remember(id: string, compute: () => string): string {
  const key = `${getVault().version}:${id}`
  let hit = memo.get(key)
  if (hit === undefined) {
    hit = compute()
    memo.set(key, hit)
  }
  return hit
}

/** A page as queries see it, plus what renderers show of its note. */
function pageSignature(page: Page, note: Note | undefined): string {
  return sha(JSON.stringify([page, note?.description, note?.unlisted, note?.source.fm.location ?? note?.source.fm.coordinates]))
}

/** Every page queries can see in a language, and every published canvas or base. */
export function vaultSignature(lang: Lang): string {
  return remember(`vault:${lang}`, () => {
    const vault = getVault()
    const pages = engineFor(lang).pages.map((p) => pageSignature(p, vault.byKey[lang].get(p.key)))
    const docs = [...vault.docs.values()].map((d) => `${d.rel}\0${sha(d.src)}`)
    return sha(JSON.stringify([pages.sort(), docs.sort()]))
  })
}

/** The pages a Dataview query can read, when its FROM names only tags and folders; else every page. */
function querySignature(src: string, lang: Lang): string {
  return remember(`query:${lang}:${sha(src)}`, () => {
    // A link anywhere can lead the query to a page outside its scope.
    if (src.includes("[[")) return vaultSignature(lang)
    let scope: Page[] | undefined
    try {
      scope = scopeOf(parseQuery(src), engineFor(lang))
    } catch {
      // an error message renders the same whatever the vault holds
      return "error"
    }
    if (!scope) return vaultSignature(lang)
    const byKey = getVault().byKey[lang]
    return sha(JSON.stringify(scope.map((p) => pageSignature(p, byKey.get(p.key))).sort()))
  })
}

/** What the note itself is to queries reading `this`: its links in and out among them. */
function selfSignature(note: Note): string {
  const page = engineFor(note.lang).pages.find((p) => p.key === note.key)
  return page ? pageSignature(page, note) : ""
}

const FENCE = /^\s*(`{3,}|~{3,})\s*(dataview|tasks|query|leaflet|contributionGraph|base)\b[^\n]*\n([\s\S]*?)^\s*\1/gim

/** Keys of the notes a note embeds (![[note]]), in its rendered markdown. */
function embedded(md: string): string[] {
  return [...md.matchAll(/class="transclude-ph" data-key="([^"]*)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
}

/** A query reading the clock: the day it ran keys it, and `now` changes too often to cache at all. */
function clock(src: string): string | undefined | null {
  if (/\bnow\b/i.test(src)) return null
  return /\b(today|tomorrow|yesterday|sod|eod)\b/i.test(src) ? `day:${new Date().toISOString().slice(0, 10)}` : undefined
}

/**
 * What a note reads beyond its own markdown, as cache key parts: empty for a
 * self-contained note, undefined for one that cannot be cached (it shows the
 * time). Embedded notes are followed as deep as rendering goes.
 */
export function dependencies(note: Note, depth = 0, seen = new Set<string>()): string[] | undefined {
  seen.add(note.key)
  const parts: string[] = []
  const lang = note.lang
  const { md } = note
  const fences = [...md.matchAll(FENCE)]
  const inline = [...md.matchAll(/`=\s([^`]*)`/g)].map((m) => m[1])
  if (fences.length || inline.length || /base-ph/.test(md)) parts.push(`self:${selfSignature(note)}`)
  for (const src of [...fences.map((m) => m[3]), ...inline]) {
    const day = clock(src)
    if (day === null) return undefined
    if (day) parts.push(day)
  }
  for (const m of fences) {
    parts.push(m[2].toLowerCase() === "dataview" ? `query:${querySignature(m[3], lang)}` : `vault:${vaultSignature(lang)}`)
  }
  // Without a link, an inline query can only read the note itself.
  if (inline.some((src) => src.includes("[["))) parts.push(`vault:${vaultSignature(lang)}`)
  if (/base-ph/.test(md)) parts.push(`vault:${vaultSignature(lang)}`)
  const byKey = getVault().byKey[lang]
  for (const key of embedded(md)) {
    const target = byKey.get(key)
    if (!target) {
      parts.push(`embed:${key}:missing`)
      continue
    }
    // A protected note embeds as its title only; a cycle or the depth limit stops rendering there.
    if (target.protected || seen.has(key) || depth >= 3) {
      parts.push(`embed:${key}:${target.title}:${target.url}:${target.protected}`)
      continue
    }
    const inner = dependencies(target, depth + 1, new Set(seen))
    if (!inner) return undefined
    parts.push(
      `embed:${key}:${target.title}:${target.url}:${target.hardBreaks}:${sha(target.md)}`,
      ...target.assets.map((a) => `${a}@${stamp(a)}`),
      ...inner,
    )
  }
  return parts
}
