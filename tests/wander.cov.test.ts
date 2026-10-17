import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { installDom, type Dom } from "./cov-dom"

const navigated: string[] = []
mock.module("astro:transitions/client", () => ({ navigate: (url: string) => void navigated.push(url) }))

type Wander = typeof import("../src/scripts/wander")
let dom: Dom
let wander: Wander
const realFetch = globalThis.fetch
const fetched: string[] = []
beforeAll(async () => {
  dom = installDom("https://garden.example/b")
  globalThis.fetch = (async (url: string) => {
    fetched.push(String(url))
    if (String(url).includes("explorer")) return new Response(`<ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul>`)
    const notes = String(url).includes("cov-lonely") ? [{ u: "/b" }] : [{ u: "/a" }, { u: "/b" }, { u: "/c" }]
    return new Response(JSON.stringify({ notes, links: [] }))
  }) as unknown as typeof fetch
  wander = await import("../src/scripts/wander")
})
afterAll(() => {
  globalThis.fetch = realFetch
  dom.restore()
})

describe("wandering", () => {
  test("a random note of the page's language is opened, never the current one", async () => {
    navigated.length = 0
    dom.document.documentElement.dataset.lang = "cov-wander"
    await wander.openRandom()
    expect(fetched).toContain("/static/graph.cov-wander.json")
    expect(navigated).toHaveLength(1)
    expect(["/a", "/c"]).toContain(navigated[0])
  })

  test("with no other note, nothing opens", async () => {
    navigated.length = 0
    dom.document.documentElement.dataset.lang = "cov-lonely"
    await wander.openRandom()
    expect(navigated).toEqual([])
  })

  test("a page without a language asks for the index of the empty one", async () => {
    delete dom.document.documentElement.dataset.lang
    await wander.openRandom()
    expect(fetched).toContain("/static/graph..json")
  })

  test("j and k follow the explorer's order, skipping folders, and stop at its ends", () => {
    dom.document.body.innerHTML = `<nav class="explorer"><ul>
      <li><a class="folder-link" href="/folder">Folder</a></li>
      <li><a href="/a">A</a></li><li><a href="/b">B</a></li><li><a href="/c">C</a></li></ul></nav>`
    navigated.length = 0
    wander.step(1)
    wander.step(-1)
    expect(navigated).toEqual(["/c", "/a"])
    dom.window.history.replaceState(null, "", "/c")
    wander.step(1)
    expect(navigated).toEqual(["/c", "/a"])
  })

  test("with only part of the tree on the page, j and k wait for the rest first", async () => {
    dom.window.history.replaceState(null, "", "/a")
    dom.document.body.innerHTML = `<nav class="explorer" data-explorer="/static/explorer.cov.json" data-explorer-partial><ul>
      <li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul></nav>`
    navigated.length = 0
    wander.step(1)
    expect(navigated).toEqual([])
    for (let i = 0; i < 50 && !navigated.length; i++) await new Promise((r) => setTimeout(r, 5))
    expect(navigated).toEqual(["/b"])
  })
})
