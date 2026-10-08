import { afterAll, describe, expect, test } from "bun:test"
import { blend, decode, nearest, similarity } from "../src/scripts/semantic"
import { noteVectors, quantize } from "../src/lib/vectors"
import { setEmbedder } from "../src/lib/embeddings"
import { contentSecurityPolicy } from "../src/lib/headers"
import { outsideHosts } from "../src/lib/privacy"
import { ConfigError, resolveConfig } from "../src/site.config"

const unit = (v: number[]) => {
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
}

describe("int8 note vectors", () => {
  test("survive the trip through base64, close enough for cosine similarity", () => {
    const a = unit([0.3, -0.5, 0.8, 0.1])
    const b = unit([0.2, -0.4, 0.9, -0.1])
    const exact = a.reduce((s, x, i) => s + x * b[i], 0)
    expect(similarity(decode(quantize(a)), decode(quantize(b)))).toBeCloseTo(exact, 1)
    // A float query against an int8 note vector.
    expect(similarity(decode(quantize(a)), b, 127)).toBeCloseTo(exact, 1)
    expect([...decode(quantize([1, -1, 0]))]).toEqual([127, -127, 0])
  })
})

describe("nearest", () => {
  const notes = [
    { url: "/a", v: decode(quantize(unit([1, 0]))) },
    { url: "/b", v: decode(quantize(unit([0.9, 0.1]))) },
    { url: "/c", v: decode(quantize(unit([0, 1]))) },
  ]
  test("best first, above the threshold, without the note itself", () => {
    const near = nearest(notes[0].v, notes, 5, 0.5, (u) => u === "/a")
    expect(near.map((n) => n.url)).toEqual(["/b"])
    expect(near[0].sim).toBeGreaterThan(0.9)
  })
})

describe("blend", () => {
  test("a note with the words and the meaning beats one with only either", () => {
    const order = blend(
      [
        { url: "/words", score: 10 },
        { url: "/both", score: 8 },
      ],
      [
        { url: "/both", sim: 0.9 },
        { url: "/meaning", sim: 0.95 },
      ],
      0.5,
    )
    expect(order).toEqual(["/both", "/words", "/meaning"])
  })
})

describe("noteVectors", () => {
  afterAll(() => setEmbedder(undefined))
  test("one vector per listed note, never a protected one", async () => {
    const seen: string[] = []
    setEmbedder(async (texts) => texts.map((t) => (seen.push(t), unit([1, 2, 3]))))
    const v = await noteVectors("vi-VN", "fake")
    expect(v.dims).toBe(3)
    expect(v.notes.some((n) => n.u === "/03_Atomic/Zettelkasten")).toBe(true)
    expect(v.notes.some((n) => n.u === "/06_Reference/Secret")).toBe(false)
    expect(seen.some((t) => t.includes("Protected content"))).toBe(false)
    expect([...decode(v.notes[0].v)]).toEqual([34, 68, 102])
  })
})

describe("search.meaning", () => {
  test("needs related.semantic", () => {
    expect(() => resolveConfig({ search: { meaning: true } }, "/v")).toThrow(ConfigError)
    expect(resolveConfig({ search: { meaning: true }, related: { semantic: true } }, "/v").search.meaning).toBe(true)
  })

  test("opens the CSP and the privacy report to the CDN and the model host", () => {
    const on = resolveConfig({ search: { meaning: true }, related: { semantic: true } }, "/v")
    const csp = contentSecurityPolicy(on, [])
    expect(csp).toContain("https://cdn.jsdelivr.net")
    expect(csp).toContain("'wasm-unsafe-eval'")
    expect(csp).toContain("https://*.hf.co")
    expect(contentSecurityPolicy(resolveConfig({}, "/v"), [])).not.toContain("jsdelivr")
    expect(outsideHosts(on, "https://f.example/a.css", [], false).map((h) => h.host)).toContain("huggingface.co")
  })
})
