import { afterAll, describe, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"

// The whole page script on a page with an explorer; happy-dom stands in for a browser.
mock.module("astro:transitions/client", () => ({ navigate: () => {} }))
const happy = new Window({ url: "https://garden.example/notes/a" })
const window = happy as unknown as globalThis.Window & typeof globalThis
const keys = ["window", "document", "location", "localStorage", "matchMedia", "HTMLElement", "MutationObserver", "IntersectionObserver"] as const
const saved = Object.fromEntries(keys.map((k) => [k, (globalThis as Record<string, unknown>)[k]]))
afterAll(() => Object.assign(globalThis, saved))
Object.assign(globalThis, Object.fromEntries(keys.map((k) => [k, (window as unknown as Record<string, unknown>)[k]])))

describe("the explorer", () => {
  test("a corrupt list of open folders is ignored, and the page still sets up", async () => {
    window.localStorage.setItem("explorer-open", "{not json")
    document.body.innerHTML = `<nav class="explorer" data-explorer><details data-dir="notes"><summary>notes</summary><a href="/notes/a">A</a></details></nav>`
    await import("../src/scripts/app")
    document.dispatchEvent(new window.Event("astro:page-load"))
    expect(document.querySelector("a")!.getAttribute("aria-current")).toBe("page")
  })
})
