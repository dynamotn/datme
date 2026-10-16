import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

// Stacked notes run in a browser; happy-dom stands in for one.
const happy = new Window({ url: "https://garden.example/note" })
// Typed as the DOM the script is written against.
const window = happy as unknown as globalThis.Window & typeof globalThis
const document = window.document
const fetched: string[] = []
const realFetch = globalThis.fetch
beforeAll(() => {
  Object.assign(globalThis, { document, location: window.location, history: window.history, DOMParser: window.DOMParser })
  globalThis.fetch = (async (url: string) => {
    fetched.push(url)
    return new Response(`<div data-stack-col data-url="${url}">evil</div>`)
  }) as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

describe("stacked notes", () => {
  test("a column only ever loads from this site", async () => {
    document.body.innerHTML = `<div data-stack-row><div data-stack-col data-url="/note"></div></div>`
    const { openColumn } = await import("../src/scripts/stack")
    const row = document.querySelector("[data-stack-row]")!
    const first = row.firstElementChild!
    for (const url of ["https://evil.example/x", "javascript:alert(1)", "//evil.example/x"]) await openColumn(row, first, url, () => {})
    expect(fetched).toEqual([])
    expect(row.children).toHaveLength(1)
    expect(window.location.href).toBe("https://garden.example/note")
    await openColumn(row, first, "/other", () => {})
    expect(fetched).toEqual(["/other"])
    expect(row.children).toHaveLength(2)
  })
})
