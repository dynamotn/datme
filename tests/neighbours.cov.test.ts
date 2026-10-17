import { afterAll, afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { fetchNeighbours, findInGarden } from "../src/lib/neighbours"

const base = "/Users/dynamo/.claude/jobs/6fc80508/tmp/cov-d"
fs.mkdirSync(base, { recursive: true })
const tmp = fs.mkdtempSync(path.join(base, "neighbours-"))
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe("neighbours out of reach", () => {
  test("a network error on both the index and the home page fails the garden, which keeps its last copy", async () => {
    const file = path.join(tmp, "a", "neighbours.json")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const old = { url: "https://far.example", fetchedAt: 1, notes: { "en-US": [{ u: "/Old", t: "Old" }] } }
    fs.writeFileSync(file, JSON.stringify({ far: old, moved: { ...old, url: "https://elsewhere.example" } }))
    const asked: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      asked.push(String(input))
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    const failed = await fetchNeighbours({ far: "https://far.example", moved: "https://moved.example" }, ["en-US"], file, 5)
    expect(failed).toEqual(["far", "moved"])
    expect(asked.sort()).toEqual([
      "https://far.example/",
      "https://far.example/static/contentIndex.en-US.json",
      "https://moved.example/",
      "https://moved.example/static/contentIndex.en-US.json",
    ])
    // A garden whose URL changed has no last copy to keep.
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ far: old })
    expect(findInGarden("far", "Old", "en-US", file)).toEqual({ url: "https://far.example/Old", title: "Old" })
    expect(findInGarden("moved", "Old", "en-US", file)).toBeUndefined()
  })

  test("a home page without a language, and an index that is no list of notes, fail too", async () => {
    const file = path.join(tmp, "b", "neighbours.json")
    globalThis.fetch = (async (input: string | URL | Request) =>
      String(input).endsWith("/") ? new Response("<html><body></body></html>") : Response.json({ notes: "none" })) as unknown as typeof fetch
    expect(await fetchNeighbours({ odd: "https://odd.example" }, ["en-US", "vi-VN"], file)).toEqual(["odd"])
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({})
  })
})

describe("findInGarden", () => {
  test("no cache file, an unreadable one, and an unknown garden all say the garden is unknown", () => {
    const prev = process.env.DATME_NEIGHBOURS
    delete process.env.DATME_NEIGHBOURS
    try {
      expect(findInGarden("any", "Note", "en-US")).toBeUndefined()
    } finally {
      if (prev !== undefined) process.env.DATME_NEIGHBOURS = prev
    }
    const bad = path.join(tmp, "bad.json")
    fs.writeFileSync(bad, "{not json")
    expect(findInGarden("any", "Note", "en-US", bad)).toBeUndefined()
  })

  test("notes are found in other languages too, by a path that is not valid URI encoding, or not at all", () => {
    const file = path.join(tmp, "c.json")
    fs.writeFileSync(
      file,
      JSON.stringify({
        g: {
          url: "https://g.example",
          fetchedAt: 1,
          notes: { "vi-VN": [{ u: "/Ghi-chú/%E0%A4%A", t: "Bad path" }, { u: "/Ghi-chú/Hoa-hồng/", t: "Hoa hồng" }] },
        },
      }),
    )
    expect(findInGarden("g", "hoa hồng.md", "en-US", file)).toEqual({ url: "https://g.example/Ghi-ch%C3%BA/Hoa-h%E1%BB%93ng/", title: "Hoa hồng" })
    expect(findInGarden("g", "%E0%A4%A", "en-US", file)).toEqual({ url: "https://g.example/Ghi-ch%C3%BA/%E0%A4%A", title: "Bad path" })
    expect(findInGarden("g", "Missing", "en-US", file)).toBeNull()
  })
})
