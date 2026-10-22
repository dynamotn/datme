import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"
import type { IndexNote } from "../src/scripts/data"

type Data = typeof import("../src/scripts/data")
const DAY = 86_400_000
const today = Math.floor(Date.now() / DAY)

const note = (over: Partial<IndexNote> = {}): IndexNote => ({
  u: "/a",
  t: "A",
  a: [],
  g: ["pkm/zettel", "garden"],
  p: "Notes",
  y: ["book"],
  s: null,
  st: "tree",
  f: "",
  d: "",
  c: "",
  m: today - 3,
  ...over,
})

describe("the content index", () => {
  let dom: Dom
  let data: Data
  const fetched: string[] = []
  const realFetch = globalThis.fetch
  beforeAll(async () => {
    dom = installDom()
    globalThis.fetch = (async (url: string) => {
      fetched.push(String(url))
      return new Response(JSON.stringify({ notes: [note()], links: [] }))
    }) as unknown as typeof fetch
    data = await import("../src/scripts/data")
  })
  afterAll(() => {
    globalThis.fetch = realFetch
    dom.restore()
  })

  test("is fetched once per language and shared", async () => {
    const [a, b] = await Promise.all([data.loadIndex("cov-data-en"), data.loadIndex("cov-data-en")])
    expect(a).toBe(b)
    expect(a.notes[0].t).toBe("A")
    await data.loadIndex("cov-data-vi")
    expect(fetched).toEqual(["/static/contentIndex.cov-data-en.json", "/static/contentIndex.cov-data-vi.json"])
  })

  test("the graph index is a file of its own, fetched once per language and shared", async () => {
    const [a, b] = await Promise.all([data.loadGraph("cov-data-en"), data.loadGraph("cov-data-en")])
    expect(a).toBe(b)
    expect(fetched).toContain("/static/graph.cov-data-en.json")
    expect(fetched.filter((u) => u.includes("cov-data-en"))).toHaveLength(2)
  })

  test("a failed load is not kept: the next call tries again", async () => {
    const real = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () =>
      ++calls === 1 ? new Response("", { status: 503 }) : new Response(JSON.stringify({ notes: [], links: [] }))) as unknown as typeof fetch
    try {
      await expect(data.loadIndex("cov-data-flaky")).rejects.toThrow("503 /static/contentIndex.cov-data-flaky.json")
      await settle()
      expect(await data.loadIndex("cov-data-flaky")).toEqual({ notes: [], links: [] })
      expect(calls).toBe(2)
    } finally {
      globalThis.fetch = real
    }
  })

  test("paths compare decoded and without trailing slashes, even when badly encoded", () => {
    expect(data.samePath("/Ti%E1%BA%BFng/", "/Tiếng")).toBe(true)
    expect(data.samePath("/", "")).toBe(true)
    expect(data.samePath("/100%", "/100%/")).toBe(true)
    expect(data.samePath("/a", "/b")).toBe(false)
  })

  test("the page language comes from the root element, Vietnamese by default", () => {
    delete document.documentElement.dataset.lang
    expect(data.currentLang()).toBe("vi-VN")
    document.documentElement.dataset.lang = "en-US"
    expect(data.currentLang()).toBe("en-US")
  })

  test("a note passes only every filter that is set", () => {
    const n = note()
    expect(data.matchesFilter(n, {})).toBe(true)
    expect(data.matchesFilter(n, { folder: "Notes", type: "book", tag: "pkm", stage: "tree", fresh: "month" })).toBe(true)
    expect(data.matchesFilter(n, { folder: "Other" })).toBe(false)
    expect(data.matchesFilter(n, { type: "film" })).toBe(false)
    expect(data.matchesFilter(n, { tag: "pk" })).toBe(false)
    expect(data.matchesFilter(n, { tag: "garden" })).toBe(true)
    expect(data.matchesFilter(n, { stage: "seed" })).toBe(false)
    expect(data.matchesFilter(n, { fresh: "older" })).toBe(false)
    expect(data.matchesFilter(note({ m: null }), { fresh: "month" })).toBe(false)
  })

  test("filters are read off a dialog's selects; an empty choice is no filter", () => {
    document.body.innerHTML = `<div>
      <select data-filter="folder"><option value="Notes" selected>Notes</option></select>
      <select data-filter="tag"><option value="" selected>Any</option></select>
      <select data-filter="fresh"><option value="year" selected>Year</option></select>
    </div>`
    expect(data.readFilters(document.body)).toEqual({ folder: "Notes", type: undefined, tag: undefined, stage: undefined, fresh: "year" })
  })
})
