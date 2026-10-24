import { describe, expect, test } from "bun:test"
import type { APIContext } from "astro"
import { getVault, listed } from "../src/lib/vault"
import { noteIndex } from "../src/lib/note-index"
import { HOOD_DEPTH, hoodOf, hoodPath, type Hood } from "../src/lib/graph-hoods"
import { neighbourhood } from "../src/scripts/graph-hops"
import * as hoods from "../src/pages/static/graph/[lang]/[id].json"
import * as graphIndex from "../src/pages/static/graph.[lang].json"

type Props = { url: string }
const call = async (params: Record<string, string>, props: Props) => await hoods.GET({ params, props } as unknown as APIContext<Props>)
const pair = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`

/** The neighbourhood a note's local graph draws today out of the whole graph: its notes, and the links among them. */
function fromWholeGraph(whole: { notes: { u: string }[]; links: [number, number][] }, url: string) {
  const at = whole.notes.findIndex((n) => n.u === url)
  const keep = neighbourhood(whole.links, at, HOOD_DEPTH)
  const urls = [...keep.keys()].map((i) => whole.notes[i].u).sort()
  const links = whole.links
    .filter(([a, b]) => keep.has(a) && keep.has(b))
    .map(([a, b]) => [whole.notes[a].u, whole.notes[b].u].sort().join(" "))
    .sort()
  return { urls, links }
}
const drawn = (hood: Hood) => ({
  urls: hood.notes.map((n) => n.u).sort(),
  links: hood.links.map(([a, b]) => [hood.notes[a].u, hood.notes[b].u].sort().join(" ")).sort(),
})

describe("neighbourhood files", () => {
  test("one per listed note and language, never for an unlisted, private or unpublished one", async () => {
    const paths = await hoods.getStaticPaths()
    for (const lang of ["vi-VN", "en-US"] as const) {
      const mine = paths.filter((p) => p.params.lang === lang)
      expect(mine.map((p) => p.props.url).sort()).toEqual(
        listed(lang)
          .map((n) => n.url)
          .sort(),
      )
      for (const p of mine) expect(hoodPath(lang, p.props.url)).toBe(`/static/graph/${lang}/${p.params.id}.json`)
    }
    expect(new Set(paths.map((p) => `${p.params.lang}/${p.params.id}`)).size).toBe(paths.length)
    const urls = paths.map((p) => p.props.url)
    for (const hidden of ["Unlisted", "Private"]) expect(urls.some((u) => u.includes(hidden))).toBe(false)
  })

  test("a page outside the graph has no file: an unlisted note, a page that is no note", () => {
    const unlisted = getVault().notes["vi-VN"].find((n) => n.unlisted)!
    expect(unlisted).toBeDefined()
    expect(hoodPath("vi-VN", unlisted.url)).toBeUndefined()
    expect(hoodPath("vi-VN", "/no/such/page")).toBeUndefined()
    expect(hoodPath("vi-VN", undefined)).toBeUndefined()
  })

  test("hold exactly what the local graph draws out of graph.json today, two links deep, with each note's links in the whole graph", async () => {
    const paths = await hoods.getStaticPaths()
    for (const lang of ["vi-VN", "en-US"] as const) {
      const whole = JSON.parse(await (await graphIndex.GET({ params: { lang } } as unknown as APIContext)).text())
      const degree = new Map<string, number>()
      for (const [a, b] of whole.links as [number, number][]) for (const i of [a, b]) degree.set(whole.notes[i].u, (degree.get(whole.notes[i].u) ?? 0) + 1)
      for (const p of paths.filter((p) => p.params.lang === lang)) {
        const r = await call(p.params, p.props)
        expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8")
        const hood = JSON.parse(await r.text()) as Hood
        expect(drawn(hood)).toEqual(fromWholeGraph(whole, p.props.url))
        // The note itself comes first, then the others.
        expect(hood.notes[0].u).toBe(p.props.url)
        hood.notes.forEach((n, i) => expect(hood.deg[i]).toBe(degree.get(n.u) ?? 0))
        const titles = new Map((whole.notes as { u: string; t: string }[]).map((n) => [n.u, n.t]))
        for (const n of hood.notes) expect(n.t).toBe(titles.get(n.u)!)
        expect(new Set(hood.links.map(([a, b]) => pair(a, b))).size).toBe(hood.links.length)
      }
    }
  }, 120_000)

  test("never name a private, unlisted or protected note's hidden links", async () => {
    const all = await Promise.all((await hoods.getStaticPaths()).map(async (p) => await (await call(p.params, p.props)).text()))
    for (const text of all) {
      expect(text).not.toContain("Private")
      expect(text).not.toContain("Unlisted")
      expect(text).not.toContain("Never published")
      expect(text).not.toContain("must never be emitted")
    }
  }, 120_000)

  test("a protected note's own links stay out, as in graph.json: only notes linking to it reach it", async () => {
    const vault = getVault()
    const secret = vault.byKey["vi-VN"].get("06_Reference/Secret")!
    const talk = vault.byKey["vi-VN"].get("07_Project/Talk")!
    expect(secret.protected).toBeTruthy()
    const saved = secret.links
    secret.links = [...saved, { key: talk.key } as (typeof saved)[number]]
    try {
      const index = await noteIndex("vi-VN", false)
      const fromSecret = hoodOf(
        index,
        index.notes.findIndex((n) => n.u === secret.url),
      )
      expect(fromSecret.notes.map((n) => n.u)).not.toContain(talk.url)
      const fromTalk = hoodOf(
        index,
        index.notes.findIndex((n) => n.u === talk.url),
      )
      expect(fromTalk.notes.map((n) => n.u)).not.toContain(secret.url)
      // The same rule as the whole graph's, which the files are cut from.
      expect(drawn(fromSecret)).toEqual(fromWholeGraph(index, secret.url))
    } finally {
      secret.links = saved
    }
  }, 60_000)

  test("a note no file knows answers 404", async () => {
    const r = await call({ lang: "vi-VN", id: "nope" }, { url: "/no/such/page" })
    expect(r.status).toBe(404)
  }, 60_000)
})
