import { beforeAll, describe, expect, mock, test } from "bun:test"
import { Window } from "happy-dom"

// Safari as the polyfill sees it: one fix to run, here recorded instead of moving sections.
const fixedRoots: unknown[] = []
mock.module("@marp-team/marpit-svg-polyfill", () => ({
  polyfills: () => Promise.resolve([({ target }: { target: unknown }) => fixedRoots.push(target)]),
}))

const happy = new Window({ url: "https://garden.example/talk" })
const window = happy as unknown as globalThis.Window & typeof globalThis
const document = window.document
const frames: FrameRequestCallback[] = []
beforeAll(() => {
  Object.assign(globalThis, {
    document,
    window,
    innerHeight: 800,
    innerWidth: 1200,
    HTMLElement: window.HTMLElement,
    requestAnimationFrame: (cb: FrameRequestCallback) => frames.push(cb),
  })
})

describe("decks in WebKit", () => {
  test("the polyfill places each deck's slides every frame, until the deck leaves the page", async () => {
    document.body.innerHTML = `<div class="marp-deck"><template shadowrootmode="open"><div class="marpit"><svg data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject><section></section></foreignObject></svg></div></template></div>`
    // A copy of its own: another test file may have loaded the module, and its polyfill, already.
    const fresh = "../src/scripts/slides?webkit"
    const { setupSlides } = (await import(fresh)) as typeof import("../src/scripts/slides")
    setupSlides()
    setupSlides()
    await Bun.sleep(0)
    const host = document.querySelector(".marp-deck")!
    // Once per deck, however often the page sets it up.
    expect(fixedRoots).toEqual([host.shadowRoot])
    frames.shift()!(0)
    expect(fixedRoots).toHaveLength(2)
    host.remove()
    frames.shift()!(0)
    expect(fixedRoots).toHaveLength(2)
    expect(frames).toHaveLength(0)
  })
})
