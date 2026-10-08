import { afterAll, describe, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"
import { quantize } from "../src/lib/vectors"

// The search dialog on a note page, with a fake index and vectors served by fetch.
mock.module("astro:transitions/client", () => ({ navigate: () => {} }))
const happy = new Window({ url: "https://garden.example/notes/a" })
const saved = { window: globalThis.window, document: globalThis.document, location: globalThis.location, HTMLElement: globalThis.HTMLElement, fetch: globalThis.fetch }
afterAll(() => Object.assign(globalThis, saved))
Object.assign(globalThis, { window: happy, document: happy.document, location: happy.location, HTMLElement: happy.HTMLElement })

const note = (u: string, t: string) => ({ u, t, a: [], g: [], p: "", y: [], s: null, f: "", d: `About ${t}`, c: "" })
const unit = (v: number[]) => v.map((x) => x / Math.hypot(...v))
const index = { notes: [note("/notes/a", "Slip box"), note("/notes/b", "Zettelkasten"), note("/notes/c", "Cooking")], links: [] }
const vectors = {
  model: "fake",
  dims: 2,
  notes: [
    { u: "/notes/a", v: quantize(unit([1, 0])) },
    { u: "/notes/b", v: quantize(unit([0.9, 0.2])) },
    { u: "/notes/c", v: quantize(unit([0, 1])) },
  ],
}
globalThis.fetch = (async (url: string) =>
  new Response(JSON.stringify(String(url).includes("vectors") ? vectors : index))) as unknown as typeof fetch

describe("the search dialog with nothing typed", () => {
  test("lists the notes closest in meaning to the page's note, under a heading", async () => {
    document.body.innerHTML = `<dialog data-search-dialog data-lang="en-US" data-engine="minisearch" data-similar="Notes like this one" data-threshold="0.5">
      <input type="search"><ul class="search-results" data-empty="Nothing"></ul></dialog>`
    const dialog = document.querySelector("dialog") as unknown as HTMLDialogElement
    dialog.showModal = function () {
      this.setAttribute("open", "")
    }
    const { openSearch, setupSearch } = await import("../src/scripts/search")
    setupSearch()
    openSearch()
    const list = document.querySelector(".search-results")!
    for (let i = 0; i < 50 && !list.querySelector("a"); i++) await new Promise((r) => setTimeout(r, 10))
    expect(list.querySelector(".group")?.textContent).toBe("Notes like this one")
    const links = [...list.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(links).toEqual(["/notes/b"])
    expect(list.querySelector(".r-sim")?.textContent).toMatch(/≈ 9\d%/)
  })
})
