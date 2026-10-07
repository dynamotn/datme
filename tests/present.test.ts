import { beforeAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

// The presenter runs in a browser; happy-dom stands in for one.
const happy = new Window({ url: "https://garden.example/talk" })
// Typed as the DOM the script is written against.
const window = happy as unknown as globalThis.Window & typeof globalThis
const document = window.document
beforeAll(() => {
  Object.assign(globalThis, { document, window, innerHeight: 800, innerWidth: 1200, HTMLElement: window.HTMLElement })
})

const slide = (n: number) => `<svg data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject><section id="${n}"><a href="/x">link</a></section></foreignObject></svg>`
const key = (k: string) => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true }))
const current = (host: Element) =>
  [...host.shadowRoot!.querySelectorAll(".marpit > svg")].findIndex((s) => s.classList.contains("current"))

describe("presenting a deck", () => {
  test("a deck parsed without its shadow root gets one, and a present button", async () => {
    document.body.innerHTML = `<div class="prose"><div class="marp-deck" data-present="Trình chiếu"><template shadowrootmode="open"><div class="marpit">${slide(1)}${slide(2)}${slide(3)}</div></template></div></div>`
    const { setupSlides } = await import("../src/scripts/slides")
    setupSlides()
    setupSlides()
    const host = document.querySelector(".marp-deck")!
    expect(host.shadowRoot!.querySelectorAll(".marpit > svg")).toHaveLength(3)
    expect(host.querySelector("template")).toBeNull()
    expect(document.querySelectorAll(".present-button")).toHaveLength(1)
    expect(document.querySelector(".present-button")!.textContent).toBe("Trình chiếu")
  })

  test("keys move between slides, and Escape ends the show", () => {
    const host = document.querySelector(".marp-deck")!
    document.querySelector<HTMLButtonElement>(".present-button")!.click()
    expect(host.classList.contains("presenting")).toBe(true)
    expect(current(host)).toBe(0)
    key("ArrowRight")
    key(" ")
    expect(current(host)).toBe(2)
    key("ArrowRight")
    expect(current(host)).toBe(2)
    key("Home")
    expect(current(host)).toBe(0)
    key("End")
    key("ArrowLeft")
    expect(current(host)).toBe(1)
    key("Escape")
    expect(host.classList.contains("presenting")).toBe(false)
    expect(current(host)).toBe(-1)
  })

  test("decks embedded in another page are read, not presented", async () => {
    document.body.innerHTML = `<div class="transclude"><div class="marp-deck"><template shadowrootmode="open"><div class="marpit">${slide(1)}</div></template></div></div>`
    const { setupSlides } = await import("../src/scripts/slides")
    setupSlides()
    expect(document.querySelector(".marp-deck")!.shadowRoot).not.toBeNull()
    expect(document.querySelector(".present-button")).toBeNull()
  })
})
