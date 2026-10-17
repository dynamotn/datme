import { describe, expect, test } from "bun:test"
import { rankRelated, type RankedNote } from "../src/lib/related"

/** The ranking as it compared every pair of notes, kept as the reference the indexed one must match. */
function allPairs(notes: RankedNote[], out: Map<string, Set<string>>, typePrefix: string, count: number, lang: string) {
  const inbound = new Map<string, Set<string>>()
  for (const [from, targets] of out) for (const to of targets) inbound.set(to, (inbound.get(to) ?? new Set()).add(from))
  const related = new Map<string, { note: RankedNote; score: number; tags: string[]; links: number }[]>()
  for (const a of notes) {
    const scored: { note: RankedNote; score: number; tags: string[]; links: number }[] = []
    for (const b of notes) {
      if (a === b) continue
      if (out.get(a.key)!.has(b.key) || out.get(b.key)!.has(a.key)) continue
      const tags = a.tags.filter((t) => b.tags.includes(t))
      const tagScore = tags.reduce((s, t) => s + (t.startsWith(typePrefix) ? 0.5 : 2), 0)
      let links = 0
      for (const k of out.get(a.key)!) if (out.get(b.key)!.has(k)) links++
      for (const k of inbound.get(a.key) ?? []) if (inbound.get(b.key)?.has(k)) links++
      const score = tagScore + links
      if (score >= 2) scored.push({ note: b, score, tags: tags.filter((t) => !t.startsWith(typePrefix)), links })
    }
    scored.sort((x, y) => y.score - x.score || x.note.title.localeCompare(y.note.title, lang))
    related.set(a.key, scored.slice(0, count))
  }
  return related
}

/** A seeded vault: few titles so ties are common, repeated and type tags, links to notes outside the list. */
function vault(n: number, seed: number) {
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
  const tags = [...Array.from({ length: 12 }, (_, i) => `topic${i}`), "type/paper", "type/book"]
  const notes: RankedNote[] = Array.from({ length: n }, (_, i) => ({
    key: `k${i}`,
    title: pick(["Alpha", "beta", "Gamma", "Ålborg", "delta", `Note ${i % 7}`]),
    tags: Array.from({ length: Math.floor(rnd() * 4) }, () => pick(tags)),
  }))
  const out = new Map(
    notes.map((x) => [x.key, new Set(Array.from({ length: Math.floor(rnd() * 5) }, () => (rnd() < 0.1 ? `hidden${Math.floor(rnd() * 5)}` : `k${Math.floor(rnd() * n)}`)))]),
  )
  return { notes, out }
}

describe("ranking related notes", () => {
  for (const [n, seed] of [
    [60, 1],
    [300, 7],
    [800, 42],
  ]) {
    test(`matches comparing every pair, ties included (${n} notes)`, () => {
      const { notes, out } = vault(n, seed)
      for (const count of [3, 50]) {
        const got = rankRelated(notes, out, { lang: "en-US", count, typePrefix: "type/" })
        const want = allPairs(notes, out, "type/", count, "en-US")
        expect(got.size).toBe(want.size)
        for (const [key, list] of want) {
          expect(got.get(key)!.map((r) => [r.note.key, r.score, r.tags, r.links])).toEqual(list.map((r) => [r.note.key, r.score, r.tags, r.links]))
        }
      }
    })
  }
})
