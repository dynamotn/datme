import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { installDom, until, type Dom } from "./client-dom"
import type { ContentIndex } from "../src/scripts/data"

const navigated: string[] = []
mock.module("astro:transitions/client", () => ({ navigate: (url: string) => void navigated.push(url) }))

type Walk = typeof import("../src/scripts/walk")
let dom: Dom
let walk: Walk
const realFetch = globalThis.fetch
const n = (u: string, t: string, a: string[] = []) => ({ u, t, a, g: [], p: "", y: [], s: null, f: "", d: "", c: "" })
const index: ContentIndex = {
  notes: [n("/notes/a", "Alpha"), n("/notes/b", "Beta"), n("/notes/c", "Gamma", ["Third"]), n("/notes/d", "Delta"), n("/notes/e", "Alphabet")],
  links: [
    [0, 1],
    [1, 2],
  ],
}
const LANG = "cov-walk"
const fetched: string[] = []
let copied: string[] = []
let clipboardFails = false
beforeAll(async () => {
  dom = installDom("https://garden.example/notes/a")
  Object.defineProperty(dom.window.navigator, "clipboard", {
    get: () => ({ writeText: async (s: string) => (clipboardFails ? Promise.reject(new Error("denied")) : void copied.push(s)) }),
    configurable: true,
  })
  globalThis.fetch = (async (url: string) => (fetched.push(String(url)), new Response(JSON.stringify(index)))) as unknown as typeof fetch
  walk = await import("../src/scripts/walk")
  // The button that opens the picker is listened for on the document of the first setup: the shared page.
  page()
  await walk.setupWalk()
  dom.document.querySelector<HTMLElement>("[data-walk-open]")!.click()
  await until(() => dom.document.querySelector("dialog"), 30)
  const dialog = dom.document.querySelector("dialog")
  expect(dialog).not.toBeNull()
  dialog!.remove()
})
afterAll(() => {
  globalThis.fetch = realFetch
  dom.restore()
})

const labels = `data-walk-label="Walk" data-walk-share="Share" data-walk-leave="Leave" data-walk-end="Arrived" data-trail-prev="Back" data-trail-next="Next" data-walk-pick="Walk to" data-walk-none="No path" data-close="Đóng"`
function page(button = true) {
  dom.document.documentElement.dataset.lang = LANG
  dom.document.body.innerHTML = `${button ? `<button data-walk-open hidden ${labels}>Walk</button>` : ""}
    <article class="note" ${labels}><header class="note-head"></header><div class="prose"><p>Text</p></div></article>`
  return dom.document.querySelector<HTMLElement>("article")!
}
const at = (path: string) => dom.window.history.replaceState(null, "", path)
const stored = () => JSON.parse(dom.window.sessionStorage.getItem("datme-walk") ?? "null")
const bar = () => dom.document.querySelector<HTMLElement>("aside[data-walk]")
const nav = () => dom.document.querySelector<HTMLElement>("nav[data-walk]")

describe("generated walks", () => {
  test("matchNotes finds titles first, then words in titles, then aliases, never the current note", () => {
    expect(walk.matchNotes(index, "alp", "/notes/b").map((i) => index.notes[i].t)).toEqual(["Alpha", "Alphabet"])
    expect(walk.matchNotes(index, "ta", "/notes/a").map((i) => index.notes[i].t)).toEqual(["Beta", "Delta"])
    expect(walk.matchNotes(index, "third", "/notes/a").map((i) => index.notes[i].t)).toEqual(["Gamma"])
    expect(walk.matchNotes(index, "  ", "/notes/a")).toEqual([])
    expect(walk.matchNotes(index, "alp", "/notes/a/")).toEqual([4])
  })

  test("a note page shows the button without fetching the whole graph; opening the picker fetches it", async () => {
    at("/notes/a")
    dom.window.sessionStorage.clear()
    page()
    dom.document.documentElement.dataset.lang = "cov-walk-lazy"
    fetched.length = 0
    await walk.setupWalk()
    expect(dom.document.querySelector<HTMLElement>("[data-walk-open]")!.hidden).toBe(false)
    expect(fetched).toEqual([])
    dom.document.querySelector<HTMLElement>("[data-walk-open]")!.click()
    await until(() => dom.document.querySelector("dialog"))
    expect(fetched).toEqual(["/static/graph.cov-walk-lazy.json"])
    dom.document.querySelector("dialog")!.remove()
  })

  test("the picker finds a note, walks the shortest path there and opens its first stop", async () => {
    at("/notes/a")
    dom.window.sessionStorage.clear()
    navigated.length = 0
    const article = page()
    await walk.setupWalk()
    expect(dom.document.querySelector<HTMLElement>("[data-walk-open]")!.hidden).toBe(false)
    expect(bar()).toBeNull()
    dom.document.querySelector<HTMLElement>("[data-walk-open]")!.click()
    await until(() => dom.document.querySelector("dialog"))
    const dialog = dom.document.querySelector("dialog")!
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector(".practice-close")!.getAttribute("aria-label")).toBe("Đóng")
    expect(dialog.querySelector("label")!.textContent).toBe("Walk to")
    const input = dialog.querySelector("input")!
    input.value = "gam"
    input.dispatchEvent(new dom.window.Event("input"))
    const results = [...dialog.querySelectorAll<HTMLButtonElement>(".walk-results button")]
    expect(results.map((b) => b.textContent)).toEqual(["Gamma"])
    results[0].click()
    expect(stored()).toEqual(["/notes/a", "/notes/b", "/notes/c"])
    expect(navigated).toEqual(["/notes/b"])
    expect(dom.document.querySelector("dialog")).toBeNull()
    expect(article.isConnected).toBe(true)
  })

  test("a note no path leads to says so; the close button closes the picker", async () => {
    dom.document.querySelector<HTMLElement>("[data-walk-open]")!.click()
    await until(() => dom.document.querySelector("dialog"))
    const dialog = dom.document.querySelector("dialog")!
    const input = dialog.querySelector("input")!
    input.value = "delta"
    input.dispatchEvent(new dom.window.Event("input"))
    dialog.querySelector<HTMLButtonElement>(".walk-results button")!.click()
    expect(dialog.querySelector(".walk-status")!.textContent).toBe("No path")
    input.value = "x"
    input.dispatchEvent(new dom.window.Event("input"))
    expect(dialog.querySelector(".walk-status")!.textContent).toBe("")
    dialog.querySelector<HTMLButtonElement>(".practice-close")!.click()
    expect(dom.document.querySelector("dialog")).toBeNull()
  })

  test("a stop of the walk shows where the reader is, with the previous and next stops", async () => {
    at("/notes/b")
    const article = page()
    await walk.setupWalk()
    expect(bar()!.querySelector(".trail-where")!.textContent).toBe("🥾 Walk Alpha → Gamma 2 / 3ShareLeave")
    expect([...bar()!.querySelectorAll(".trail-dots li")].map((li) => li.className)).toEqual(["done", "here", ""])
    expect(article.querySelector(".note-head")!.nextElementSibling).toBe(bar())
    expect(article.querySelector(".prose")!.nextElementSibling).toBe(nav())
    const prev = nav()!.querySelector<HTMLAnchorElement>("[data-trail-prev]")!
    const next = nav()!.querySelector<HTMLAnchorElement>("[data-trail-next]")!
    expect([prev.getAttribute("href"), prev.textContent]).toEqual(["/notes/a", "← BackAlpha"])
    expect([next.getAttribute("href"), next.textContent]).toEqual(["/notes/c", "Next →Gamma"])
    // Set up again, the walk is drawn once.
    await walk.setupWalk()
    expect(dom.document.querySelectorAll("aside[data-walk]")).toHaveLength(1)
  })

  test("the first stop has no way back, the last one says it arrived", async () => {
    at("/notes/a")
    page()
    await walk.setupWalk()
    expect(nav()!.firstElementChild!.tagName).toBe("SPAN")
    at("/notes/c")
    page()
    await walk.setupWalk()
    expect(nav()!.querySelector(".walk-end")!.textContent).toBe("Arrived ✓Gamma")
    expect(nav()!.querySelector("[data-trail-next]")).toBeNull()
  })

  test("sharing copies a link that carries the walk; without the clipboard the address carries it", async () => {
    at("/notes/b")
    copied = []
    page()
    await walk.setupWalk()
    const share = bar()!.querySelector<HTMLButtonElement>(".trail-leave")!
    share.click()
    await until(() => copied.length)
    expect(copied).toEqual(["https://garden.example/notes/b?walk=%2Fnotes%2Fa,%2Fnotes%2Fb,%2Fnotes%2Fc"])
    expect(share.textContent).toBe("Copied")
    dom.document.body.dataset.copied = "Đã chép"
    share.click()
    await until(() => share.textContent === "Đã chép")
    expect(share.textContent).toBe("Đã chép")
    clipboardFails = true
    bar()!.querySelector<HTMLButtonElement>(".trail-leave")!.click()
    await until(() => dom.window.location.search)
    expect(dom.window.location.search).toBe("?walk=%2Fnotes%2Fa,%2Fnotes%2Fb,%2Fnotes%2Fc")
    clipboardFails = false
  })

  test("a shared link starts the walk and leaves the address clean; leaving ends it", async () => {
    dom.window.sessionStorage.clear()
    at("/notes/c?walk=%2Fnotes%2Fc,%2Fnotes%2Fb,,%2Fnotes%2Fzeta&x=1")
    page(false)
    await walk.setupWalk()
    expect(dom.window.location.search).toBe("?x=1")
    expect(stored()).toEqual(["/notes/c", "/notes/b", "/notes/zeta"])
    expect(bar()!.querySelector(".trail-where")!.textContent).toContain("Gamma → zeta")
    const [, leave] = bar()!.querySelectorAll<HTMLButtonElement>(".trail-leave")
    leave.click()
    expect(stored()).toBeNull()
    expect(bar()).toBeNull()
    expect(nav()).toBeNull()
  })

  test("off the walk, on a page with no note, no language or neither button nor walk, nothing shows", async () => {
    dom.window.sessionStorage.setItem("datme-walk", JSON.stringify(["/notes/a", "/notes/b"]))
    at("/notes/d")
    page(false)
    await walk.setupWalk()
    expect(bar()).toBeNull()
    dom.window.sessionStorage.clear()
    page(false)
    await walk.setupWalk()
    expect(bar()).toBeNull()
    dom.document.body.innerHTML = ""
    await walk.setupWalk()
    page()
    delete dom.document.documentElement.dataset.lang
    await walk.setupWalk()
    expect(dom.document.querySelector<HTMLElement>("[data-walk-open]")!.hidden).toBe(true)
  })

  test("the picker does not open on a page the index does not know; a click elsewhere opens nothing", async () => {
    at("/notes/unknown")
    page()
    await walk.setupWalk()
    dom.document.body.click()
    dom.document.querySelector<HTMLElement>("[data-walk-open]")!.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(dom.document.querySelector("dialog")).toBeNull()
  })

  test("with storage blocked the walk lasts while the address carries it", async () => {
    const real = globalThis.sessionStorage
    const blocked = {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
      removeItem() {
        throw new Error("blocked")
      },
    }
    Object.defineProperty(globalThis, "sessionStorage", { value: blocked, configurable: true, writable: true })
    try {
      at("/notes/a?walk=%2Fnotes%2Fa,%2Fnotes%2Fb")
      page(false)
      await walk.setupWalk()
      expect(bar()).toBeNull()
      at("/notes/a")
      page()
      await walk.setupWalk()
      dom.document.querySelector<HTMLElement>("[data-walk-open]")!.click()
      await until(() => dom.document.querySelector("dialog"))
      const dialog = dom.document.querySelector("dialog")!
      const input = dialog.querySelector("input")!
      input.value = "beta"
      input.dispatchEvent(new dom.window.Event("input"))
      dialog.querySelector<HTMLButtonElement>(".walk-results button")!.click()
      expect(navigated.at(-1)).toBe("/notes/b")
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", { value: real, configurable: true, writable: true })
    }
  })

  test("a walk of one stop names its note by the end of its path", async () => {
    dom.window.sessionStorage.setItem("datme-walk", JSON.stringify(["/notes/a"]))
    at("/notes/a")
    page(false)
    await walk.setupWalk()
    expect(bar()!.querySelector(".trail-where")!.textContent).toContain("Alpha → Alpha")
    expect(nav()!.querySelector(".walk-end")).not.toBeNull()
    expect(walk.shortestPath([], 1, 0, 0)).toEqual([0])
    expect(walk.decodeWalk(walk.encodeWalk(["/a b", "/c,d"]))).toEqual(["/a b", "/c,d"])
  })
})
