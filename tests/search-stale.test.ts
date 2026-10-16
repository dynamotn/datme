import { afterAll, describe, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"
import { quantize } from "../src/lib/vectors"

// The search dialog on a note page; the vectors arrive late, the index at once.
mock.module("astro:transitions/client", () => ({ navigate: () => {} }))
const happy = new Window({ url: "https://garden.example/notes/a" })
const saved = { window: globalThis.window, document: globalThis.document, location: globalThis.location, HTMLElement: globalThis.HTMLElement, fetch: globalThis.fetch }
afterAll(() => Object.assign(globalThis, saved))
Object.assign(globalThis, { window: happy, document: happy.document, location: happy.location, HTMLElement: happy.HTMLElement })

const note = (u: string, t: string) => ({ u, t, a: [], g: [], p: "", y: [], s: null, f: "", d: `About ${t}`, c: "" })
const index = { notes: [note("/notes/a", "Slip box"), note("/notes/b", "Zettelkasten"), note("/notes/c", "Cooking")], links: [] }
const vectors = {
  model: "fake",
  dims: 2,
  notes: [
    { u: "/notes/a", v: quantize([1, 0]) },
    { u: "/notes/b", v: quantize([1, 0]) },
    { u: "/notes/c", v: quantize([0, 1]) },
  ],
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
globalThis.fetch = (async (url: string) => {
  if (String(url).includes("vectors")) await wait(200)
  return new Response(JSON.stringify(String(url).includes("vectors") ? vectors : index))
}) as unknown as typeof fetch

describe("the search dialog", () => {
  test("a slower answer to an older search never replaces a newer one", async () => {
    document.body.innerHTML = `<dialog data-search-dialog data-lang="de-DE" data-engine="minisearch" data-similar="Notes like this one" data-threshold="0.5">
      <input type="search"><ul class="search-results" data-empty="Nothing"></ul></dialog>`
    const dialog = document.querySelector("dialog") as unknown as HTMLDialogElement
    dialog.showModal = function () {
      this.setAttribute("open", "")
    }
    const { openSearch, setupSearch } = await import("../src/scripts/search")
    setupSearch()
    // Opening asks for notes like this one; typing then searches before the vectors arrive.
    openSearch()
    const input = dialog.querySelector("input")!
    input.value = "cooking"
    input.dispatchEvent(new happy.Event("input") as unknown as Event)
    await wait(400)
    const links = [...document.querySelectorAll(".search-results a")].map((a) => a.getAttribute("href"))
    expect(links).toEqual(["/notes/c"])
  })
})
