import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"

// The script keeps the root element of the document it is first imported with, so it runs on the shared page.
let dom: Dom
const fetched: string[] = []
const realFetch = globalThis.fetch
beforeAll(() => {
  dom = installDom("https://garden.example/note")
  globalThis.fetch = (async (url: string) => {
    fetched.push(url)
    return new Response(`<div data-stack-col data-url="${url}">evil</div>`)
  }) as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
  document.body.innerHTML = ""
  dom.restore()
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
    expect(location.href).toBe("https://garden.example/note")
    await openColumn(row, first, "/other", () => {})
    expect(fetched).toEqual(["/other"])
    expect(row.children).toHaveLength(2)
  })
})
