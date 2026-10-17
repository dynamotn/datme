import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"

type Footprints = typeof import("../src/scripts/footprints")
const KEY = "datme:visited"
const RESTORE = "datme:restore"

describe("footprints in the browser", () => {
  let dom: Dom
  let fp: Footprints
  const scrolled: number[] = []
  let frames: (() => void)[] = []
  beforeAll(async () => {
    dom = installDom("https://garden.example/en-US/note")
    dom.set("scrollTo", (o: { top: number }) => void scrolled.push(o.top))
    dom.set("requestAnimationFrame", (cb: () => void) => (frames.push(cb), 1))
    fp = await import("../src/scripts/footprints")
  })
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    scrolled.length = 0
    frames = []
  })
  afterAll(() => dom.restore())

  const setHeight = (h: number) => Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: h })
  const stored = () => JSON.parse(localStorage.getItem(KEY)!)
  const scrollTo = (y: number) => {
    Object.defineProperty(dom.window, "scrollY", { configurable: true, value: y })
    dom.window.dispatchEvent(new dom.window.Event("scroll") as unknown as Event)
  }

  test("opening a note records the visit under the title of its column", () => {
    document.body.innerHTML = `<div class="stack-col" data-title="My note"><article class="note" data-key="k"></article></div>`
    fp.setupFootprints()
    const f = stored()
    expect(Object.keys(f.visits)).toEqual(["/en-US/note"])
    expect(f.last).toEqual({ u: "/en-US/note", t: "My note", y: 0 })
  })

  test("without a column the page title is used", () => {
    document.title = "Page title"
    document.body.innerHTML = `<article class="note" data-key="k"></article>`
    fp.setupFootprints()
    expect(stored().last.t).toBe("Page title")
  })

  test("following 'continue reading' scrolls the note back to where the reader was", () => {
    setHeight(2000)
    localStorage.setItem(KEY, JSON.stringify({ visits: {}, last: { u: "/en-US/note", t: "N", y: 0.5 } }))
    sessionStorage.setItem(RESTORE, "/en-US/note/")
    document.body.innerHTML = `<article class="note" data-key="k"></article>`
    fp.setupFootprints()
    expect(sessionStorage.getItem(RESTORE)).toBeNull()
    expect(frames).toHaveLength(1)
    frames[0]()
    expect(scrolled).toEqual([0.5 * (2000 - 768)])
  })

  test("a plain visit, or one to the top of the note, does not scroll", () => {
    localStorage.setItem(KEY, JSON.stringify({ visits: {}, last: { u: "/en-US/note", t: "N", y: 0.5 } }))
    document.body.innerHTML = `<article class="note" data-key="k"></article>`
    fp.setupFootprints()
    sessionStorage.setItem(RESTORE, "/en-US/note")
    localStorage.setItem(KEY, JSON.stringify({ visits: {}, last: { u: "/en-US/other", t: "N", y: 0 } }))
    fp.setupFootprints()
    expect(frames).toHaveLength(0)
  })

  test("blocked session storage starts the note at the top", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")!
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem() {
          throw new Error("blocked")
        },
        setItem() {
          throw new Error("blocked")
        },
      },
    })
    try {
      document.body.innerHTML = `<article class="note" data-key="k"></article><div data-continue><a href="/en-US/x"><span data-continue-title></span></a></div>`
      fp.setupFootprints()
      expect(frames).toHaveLength(0)
      // Following the link still works; only the place is not kept.
      expect(() => document.querySelector("a")!.click()).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", real)
    }
  })

  test("blocked local storage keeps footprints for this visit only", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!
    const throws = () => {
      throw new Error("blocked")
    }
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem: throws, removeItem: throws, clear() {} } })
    try {
      document.body.innerHTML = `<article class="note" data-key="k"></article>`
      expect(() => fp.setupFootprints()).not.toThrow()
      expect(() => fp.forgetFootprints()).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, "localStorage", real)
    }
  })

  test("how far the reader scrolled is saved, after a pause, on the note read last only", async () => {
    setHeight(1768)
    document.body.innerHTML = `<article class="note" data-key="k"></article>`
    fp.setupFootprints()
    scrollTo(250)
    scrollTo(500)
    await settle(350)
    expect(stored().last.y).toBe(0.5)
    // Past the end counts as the end.
    scrollTo(5000)
    await settle(350)
    expect(stored().last.y).toBe(1)

    // A page too short to scroll is at the top.
    setHeight(100)
    scrollTo(10)
    await settle(350)
    expect(stored().last.y).toBe(0)

    // Another note read last is left alone.
    setHeight(1768)
    localStorage.setItem(KEY, JSON.stringify({ visits: {}, last: { u: "/en-US/other", t: "O", y: 0.2 } }))
    scrollTo(500)
    await settle(350)
    expect(stored().last).toEqual({ u: "/en-US/other", t: "O", y: 0.2 })

    // Nothing at all is read last.
    localStorage.setItem(KEY, JSON.stringify({ visits: {} }))
    scrollTo(400)
    await settle(350)
    expect(stored()).toEqual({ visits: {} })

    // Off a note page, nothing is saved.
    document.body.innerHTML = `<main></main>`
    localStorage.clear()
    scrollTo(300)
    await settle(350)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  test("the home page offers to continue the note left part way, and keeps the place on the way", () => {
    localStorage.setItem(KEY, JSON.stringify({ visits: { "/en-US/a": 1 }, last: { u: "/en-US/a", t: "Note A", y: 0.426 } }))
    document.body.innerHTML = `<div data-continue hidden><a href="#"><span data-continue-title></span><i data-continue-depth></i></a></div><p>other</p>`
    fp.setupFootprints()
    const box = document.querySelector<HTMLElement>("[data-continue]")!
    expect(box.hidden).toBe(false)
    expect(box.querySelector("a")!.getAttribute("href")).toBe("/en-US/a")
    expect(box.querySelector("[data-continue-title]")!.textContent).toBe("Note A")
    expect(box.querySelector<HTMLElement>("[data-continue-depth]")!.style.getPropertyValue("--depth")).toBe("43%")
    document.querySelector("p")!.click()
    expect(sessionStorage.getItem(RESTORE)).toBeNull()
    box.querySelector("a")!.click()
    expect(sessionStorage.getItem(RESTORE)).toBe("/en-US/a")
  })

  test("the continue card hides when nothing was read, and works without a depth bar", () => {
    document.body.innerHTML = `<div data-continue><a href="#"><span data-continue-title></span></a></div>`
    fp.setupFootprints()
    expect(document.querySelector<HTMLElement>("[data-continue]")!.hidden).toBe(true)
    localStorage.setItem(KEY, JSON.stringify({ visits: {}, last: { u: "/en-US/b", t: "B", y: 0 } }))
    fp.setupFootprints()
    expect(document.querySelector("[data-continue-title]")!.textContent).toBe("B")
  })

  test("'forget where I've been' clears the footprints, hides the card and says so for a while", async () => {
    localStorage.setItem(KEY, JSON.stringify({ visits: { "/a": 1 }, last: { u: "/a", t: "A", y: 0.1 } }))
    document.body.innerHTML = `<button data-forget-footprints data-done="Forgotten">Forget</button><div data-continue><a href="#"><span data-continue-title></span></a></div>`
    fp.setupFootprints()
    fp.setupFootprints()
    let heard = 0
    document.addEventListener("footprints-forgotten", () => heard++)
    const button = document.querySelector("button")!
    button.click()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(heard).toBe(1)
    expect(button.textContent).toBe("Forgotten")
    expect(document.querySelector<HTMLElement>("[data-continue]")!.hidden).toBe(true)
    await settle(1550)
    expect(button.textContent).toBe("Forget")
  })

  test("broken storage reads as no footprints; past the limit the oldest visits go", () => {
    localStorage.setItem(KEY, "{not json")
    expect(fp.readFootprints()).toEqual({ visits: {} })
    localStorage.setItem(KEY, JSON.stringify({ visits: 3, last: { t: "no path" } }))
    expect(fp.readFootprints()).toEqual({ visits: {}, last: undefined })
    let f = fp.readFootprints()
    for (let i = 0; i < 4; i++) f = fp.visit(f, `/n${i}`, "", i, 2)
    expect(Object.keys(f.visits).sort()).toEqual(["/n2", "/n3"])
    expect(fp.MAX_VISITS).toBe(2000)
    // A badly encoded path is kept raw.
    expect(fp.hasVisited(fp.visit(f, "/100%", "", 9), "/100%/")).toBe(true)
  })

  test("without a done label the button keeps its own", () => {
    document.body.innerHTML = `<button data-forget-footprints>Forget</button>`
    fp.setupFootprints()
    const button = document.querySelector("button")!
    button.click()
    expect(button.textContent).toBe("Forget")
  })
})
