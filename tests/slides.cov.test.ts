import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"

type Slides = typeof import("../src/scripts/slides")
let dom: Dom
let slides: Slides
beforeAll(async () => {
  dom = installDom("https://garden.example/talk", { innerWidth: 1200, innerHeight: 800 })
  slides = await import("../src/scripts/slides")
})
afterAll(() => {
  // The document is shared with the other test files: take the faked full screen away again.
  const doc = dom.document as unknown as Record<string, unknown>
  delete doc.fullscreenElement
  delete doc.exitFullscreen
  dom.restore()
})

const slide = (n: number) => `<svg data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject><section id="s${n}"><p>Slide ${n}</p><a href="/x">link</a></section></foreignObject></svg>`
const deck = (n = 3) => `<div class="marp-deck"><template shadowrootmode="open"><div class="marpit">${Array.from({ length: n }, (_, i) => slide(i + 1)).join("")}</div></template></div>`
const current = (host: Element) => [...host.shadowRoot!.querySelectorAll(".marpit > svg")].findIndex((s) => s.classList.contains("current"))
const clickIn = (host: Element, selector: string, clientX: number) =>
  host.shadowRoot!.querySelector(selector)!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, clientX }))

describe("decks copied into another page", () => {
  test("attachDecks gives every deck under a root its slides, once", () => {
    const box = dom.document.createElement("div")
    box.innerHTML = deck(2) + deck(1) + `<div class="marp-deck"></div>`
    slides.attachDecks(box)
    slides.attachDecks(box)
    const [a, b, empty] = box.querySelectorAll(".marp-deck")
    expect(a.shadowRoot!.querySelectorAll("svg")).toHaveLength(2)
    expect(b.shadowRoot!.querySelectorAll("svg")).toHaveLength(1)
    expect(empty.shadowRoot).toBeNull()
  })
})

describe("keepPlaced", () => {
  test("runs the fixes now and every frame while the deck is on the page, and not at all without fixes", () => {
    const host = { isConnected: true }
    const targets: unknown[] = []
    const frames: (() => void)[] = []
    const root = dom.document.createElement("div")
    slides.keepPlaced(host, root, [({ target }) => void targets.push(target)], (tick) => frames.push(tick))
    expect(targets).toEqual([root])
    frames.shift()!()
    expect(targets).toHaveLength(2)
    host.isConnected = false
    frames.shift()!()
    expect(targets).toHaveLength(2)
    expect(frames).toHaveLength(0)
    slides.keepPlaced({ isConnected: true }, root, [], (tick) => frames.push(tick))
    expect(frames).toHaveLength(0)
  })

  test("uses the browser's animation frames by default", async () => {
    const host = { isConnected: true }
    let runs = 0
    slides.keepPlaced(host, dom.document.createElement("div"), [() => void runs++])
    await new Promise((r) => setTimeout(r, 60))
    host.isConnected = false
    expect(runs).toBeGreaterThan(1)
  })
})

describe("presenting with the keyboard", () => {
  test("every key moves as it should; modified keys and other keys do nothing", async () => {
    dom.document.body.innerHTML = `<div class="prose">${deck(5)}</div>`
    slides.setupSlides()
    const host = dom.document.querySelector(".marp-deck")!
    // The reader looks at the third slide: the show begins there.
    host.shadowRoot!.querySelectorAll("svg").forEach((s, i) => (s.getBoundingClientRect = () => ({ top: i * 200, bottom: i * 200 + 100 }) as DOMRect))
    let exited = 0
    Object.defineProperty(host, "requestFullscreen", { value: () => Promise.reject(new Error("denied")), configurable: true })
    dom.document.querySelector<HTMLButtonElement>(".present-button")!.click()
    expect(current(host)).toBe(2)
    const press = (key: string, init: KeyboardEventInit = {}) => {
      const e = new dom.window.KeyboardEvent("keydown", { key, cancelable: true, ...init })
      dom.document.dispatchEvent(e)
      return e.defaultPrevented
    }
    const moves: [string, KeyboardEventInit, number][] = [
      ["ArrowDown", {}, 3],
      ["PageDown", {}, 4],
      ["ArrowUp", {}, 3],
      ["PageUp", {}, 2],
      [" ", { shiftKey: true }, 1],
      [" ", {}, 2],
      ["Home", {}, 0],
      ["ArrowLeft", {}, 0],
      ["End", {}, 4],
      ["ArrowRight", { altKey: true }, 4],
      ["ArrowLeft", { ctrlKey: true }, 4],
      ["ArrowLeft", { metaKey: true }, 4],
      ["x", {}, 4],
    ]
    for (const [key, init, at] of moves) {
      press(key, init)
      expect([key, init, current(host)]).toEqual([key, init, at])
    }
    expect(press("End")).toBe(true)
    expect(press("x")).toBe(false)
    // Ending a show that is full screen leaves full screen too.
    Object.defineProperty(dom.document, "fullscreenElement", { value: host, configurable: true })
    Object.defineProperty(dom.document, "exitFullscreen", { value: () => (exited++, Promise.reject(new Error("no"))), configurable: true })
    press("Escape")
    expect(exited).toBe(1)
    expect(host.classList.contains("presenting")).toBe(false)
    Object.defineProperty(dom.document, "fullscreenElement", { value: null, configurable: true })
    // Without a show, keys do nothing.
    expect(press("ArrowRight")).toBe(false)
  })

  test("a deck without slides is not presented", () => {
    dom.document.body.innerHTML = `<div class="prose"><div class="marp-deck"><template shadowrootmode="open"><div class="marpit"></div></template></div></div>`
    slides.setupSlides()
    dom.document.querySelector<HTMLButtonElement>(".present-button")!.click()
    expect(dom.document.querySelector(".marp-deck")!.classList.contains("presenting")).toBe(false)
  })
})

describe("presenting by clicking", () => {
  test("a click on a slide moves on, on its left third moves back; links and decks not on show are left alone", () => {
    dom.document.body.innerHTML = `<div class="prose">${deck(3)}${deck(2)}</div>`
    slides.setupSlides()
    const [host, other] = dom.document.querySelectorAll(".marp-deck")
    // Not presenting: a click does nothing.
    clickIn(host, "svg", 1000)
    expect(current(host)).toBe(-1)
    dom.document.querySelector<HTMLButtonElement>(".present-button")!.click()
    expect(host.classList.contains("presenting")).toBe(true)
    expect(current(host)).toBe(0)
    clickIn(host, "section p", 1000)
    expect(current(host)).toBe(1)
    clickIn(host, "section a", 1000)
    expect(current(host)).toBe(1)
    clickIn(host, "section p", 100)
    expect(current(host)).toBe(0)
    // Clicks on another deck do not move this one.
    clickIn(other, "svg", 1000)
    expect(current(host)).toBe(0)
    expect(current(other)).toBe(-1)
  })

  test("leaving full screen with the browser's controls ends the presentation", () => {
    const host = dom.document.querySelector(".marp-deck")!
    Object.defineProperty(dom.document, "fullscreenElement", { value: host, configurable: true })
    dom.document.dispatchEvent(new dom.window.Event("fullscreenchange"))
    expect(host.classList.contains("presenting")).toBe(true)
    Object.defineProperty(dom.document, "fullscreenElement", { value: null, configurable: true })
    dom.document.dispatchEvent(new dom.window.Event("fullscreenchange"))
    expect(host.classList.contains("presenting")).toBe(false)
    expect(current(host)).toBe(-1)
    // Nothing on show: the event changes nothing.
    dom.document.dispatchEvent(new dom.window.Event("fullscreenchange"))
    expect(host.classList.contains("presenting")).toBe(false)
  })

  test("setting up the same document again listens once; a deck removed mid-show is forgotten", () => {
    dom.document.body.innerHTML = `<div class="prose">${deck(3)}</div>`
    slides.setupSlides()
    slides.setupSlides()
    const host = dom.document.querySelector(".marp-deck")!
    dom.document.querySelector<HTMLButtonElement>(".present-button")!.click()
    dom.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight" }))
    expect(current(host)).toBe(1)
    host.remove()
    dom.document.body.innerHTML = `<div class="prose">${deck(2)}</div>`
    slides.setupSlides()
    const next = dom.document.querySelector(".marp-deck")!
    dom.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight" }))
    expect(current(next)).toBe(-1)
  })
})
