import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { getVault, listed } from "~/lib/vault"
import { renderNote } from "~/lib/markdown"

export const getStaticPaths = (() => site.langs.map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths

/** Search, graph and popover data for one language. */
export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  const vault = getVault()
  const notes = listed(lang)
  const index = new Map(notes.map((n, i) => [n.key, i]))
  const folders = vault.folders[lang]
  const entries = await Promise.all(
    notes.map(async (n) => {
      const r = await renderNote(n)
      return {
        u: n.url,
        t: r.h1 && n.isHome ? r.h1 : n.title,
        a: n.aliases,
        g: n.tags,
        s: n.stage ? site.stages[n.stage].icon : null,
        f: folders.get(n.dir)?.name ?? "",
        d: r.description,
        c: r.text.slice(0, 6000),
      }
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
  return new Response(JSON.stringify({ notes: entries, links }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}
