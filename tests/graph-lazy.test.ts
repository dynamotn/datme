import { afterAll, describe, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"

mock.module("astro:transitions/client", () => ({ navigate: () => {} }))
// The local graph on a note page; happy-dom stands in for a browser, a fake observer for scrolling.
const happy = new Window({ url: "https://garden.example/notes/a" })
const window = happy as unknown as globalThis.Window & typeof globalThis
let seen: ((entries: { isIntersecting: boolean }[]) => void) | undefined
class FakeObserver {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    seen = cb
  }
  observe() {}
  disconnect() {}
}
const fetched: string[] = []
const saved = { window: globalThis.window, document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch, IntersectionObserver: globalThis.IntersectionObserver, localStorage: globalThis.localStorage }
afterAll(() => Object.assign(globalThis, saved))
Object.assign(globalThis, { window, document: window.document, location: window.location, localStorage: window.localStorage, IntersectionObserver: FakeObserver })
globalThis.fetch = (async (url: string) => {
  fetched.push(String(url))
  return new Response(JSON.stringify({ notes: [], links: [] }))
}) as unknown as typeof fetch

describe("the local graph", () => {
  test("fetches the index only once it scrolls into view", async () => {
    document.body.innerHTML = `<div class="graph-box"><canvas data-graph="local" data-lang="xx-XX"></canvas></div>`
    const { mountLocalGraph } = await import("../src/scripts/graph")
    const canvas = document.querySelector("canvas")!
    mountLocalGraph(canvas)
    // Detached, the graph stops right after loading its data: drawing needs a real browser.
    canvas.remove()
    await new Promise((r) => setTimeout(r, 10))
    expect(fetched).toEqual([])
    seen?.([{ isIntersecting: true }])
    await new Promise((r) => setTimeout(r, 10))
    expect(fetched).toEqual(["/static/contentIndex.xx-XX.json"])
  })
})
