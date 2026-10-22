import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { model } from "./cov-transformers"
import { quantize } from "../src/lib/vectors"
import { blend, embedQuery, loadVectors, nearest, similarity } from "../src/scripts/semantic"

const realFetch = globalThis.fetch
const asked: string[] = []
beforeAll(() => {
  globalThis.fetch = (async (url: string) => {
    asked.push(String(url))
    if (String(url).includes("cov-down")) throw new Error("offline")
    if (String(url).includes("cov-none")) return new Response("missing", { status: 404 })
    return new Response(JSON.stringify({ model: "m", dims: 2, notes: [{ u: "/a", v: quantize([1, 0]) }] }))
  }) as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

describe("note vectors", () => {
  test("are fetched once per language and decoded", async () => {
    const first = await loadVectors("cov-sem")
    const again = await loadVectors("cov-sem")
    expect(first).toEqual([{ url: "/a", v: new Int8Array([127, 0]) }])
    expect(again).toBe(first!)
    expect(asked.filter((u) => u === "/static/vectors.cov-sem.json")).toHaveLength(1)
  })

  test("a site without vectors, or a failed download, has none", async () => {
    expect(await loadVectors("cov-none")).toBeUndefined()
    expect(await loadVectors("cov-down")).toBeUndefined()
  })
})

describe("embedding a query", () => {
  test("a failed download of the model can be tried again; then the model is kept", async () => {
    // The module keeps the first model it gets for the whole bun process: only a first download can fail here.
    const first = model.downloads === 0
    const before = model.downloads
    if (first) {
      model.failNext = true
      await expect(embedQuery("Xenova/model", "cooking")).rejects.toThrow("download failed")
    }
    expect(await embedQuery("Xenova/model", "cooking")).toEqual([0, 1])
    expect(await embedQuery("Xenova/model", "slip box")).toEqual([1, 0])
    expect(model.downloads - before).toBe(first ? 2 : 0)
    expect(model.asked.at(-1)).toMatch(/^feature-extraction:.+:q8$/)
  })

  test("blend with no word matches ranks by meaning alone, and a threshold of 1 does not divide by zero", () => {
    expect(blend([], [{ url: "/m", sim: 1 }], 1)).toEqual(["/m"])
    // A note with both words and meaning ranks above one with the words alone.
    expect(
      blend(
        [
          { url: "/w", score: 4 },
          { url: "/both", score: 4 },
        ],
        [{ url: "/both", sim: 0.9 }],
        0.5,
      ),
    ).toEqual(["/both", "/w"])
  })

  test("nearest keeps the closest notes above the threshold, best first, without the skipped one", () => {
    const notes = [
      { url: "/a", v: new Int8Array([127, 0]) },
      { url: "/b", v: new Int8Array([90, 90]) },
      { url: "/c", v: new Int8Array([0, 127]) },
    ]
    expect(nearest([1, 0], notes, 5, 0.5, undefined, 127).map((n) => n.url)).toEqual(["/a", "/b"])
    expect(nearest(new Int8Array([127, 0]), notes, 1, 0, (u) => u === "/a").map((n) => n.url)).toEqual(["/b"])
    expect(similarity([127, 0], [127, 0])).toBe(1)
  })
})
