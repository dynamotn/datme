import { afterAll, describe, expect, test } from "bun:test"
import { loadIndex } from "../src/scripts/data"

const realFetch = globalThis.fetch
afterAll(() => void (globalThis.fetch = realFetch))

describe("loadIndex", () => {
  test("a failed fetch is not kept: the next call tries again", async () => {
    const answers = [
      () => Promise.reject(new TypeError("offline")),
      () => Promise.resolve(new Response("not found", { status: 404 })),
      () => Promise.resolve(Response.json({ notes: [], links: [] })),
    ]
    let calls = 0
    globalThis.fetch = (() => answers[calls++]()) as unknown as typeof fetch
    await expect(loadIndex("xx")).rejects.toThrow("offline")
    await expect(loadIndex("xx")).rejects.toThrow("404")
    expect(await loadIndex("xx")).toEqual({ notes: [], links: [] })
    // Once loaded, the index is kept.
    expect(await loadIndex("xx")).toEqual({ notes: [], links: [] })
    expect(calls).toBe(3)
  })
})
