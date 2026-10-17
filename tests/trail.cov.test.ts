import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, sharedOrFresh, type Dom } from "./cov-dom"

type Trail = typeof import("../src/scripts/trail")
let dom: Dom
let trail: Trail
beforeAll(async () => {
  dom = installDom("https://garden.example/notes/b?trail=pkm&x=1")
  // The module listens on the document it was imported with.
  trail = await sharedOrFresh<Trail>("../src/scripts/trail", () => {
    dom.document.body.innerHTML = `<a data-trail-start="probe">probe</a>`
    dom.document.querySelector<HTMLElement>("a")!.click()
    const answered = dom.window.sessionStorage.getItem("datme-trail") === "probe"
    dom.window.sessionStorage.clear()
    dom.document.body.innerHTML = ""
    return answered
  })
})
afterAll(() => dom.restore())

const page = () => {
  dom.document.body.innerHTML = `
    <aside data-trail="pkm" hidden><button data-trail-leave>Leave</button></aside>
    <aside data-trail="cooking" hidden></aside>
    <nav data-trail="pkm" hidden><a data-trail-prev href="#a">A</a><a data-trail-next href="#c">C</a></nav>
    <nav data-trail="cooking" hidden><a data-trail-end href="#done">Done</a></nav>
    <a data-trail-start="cooking" href="#start"><span>Start</span></a>`
}
const shown = () => [...dom.document.querySelectorAll<HTMLElement>("[data-trail]")].filter((e) => !e.hidden).map((e) => `${e.tagName}:${e.dataset.trail}`)

describe("guided trails", () => {
  test("?trail= remembers the trail, shows its stops and leaves the address clean", () => {
    page()
    trail.setupTrail()
    expect(dom.window.sessionStorage.getItem("datme-trail")).toBe("pkm")
    expect(dom.window.location.href).toBe("https://garden.example/notes/b?x=1")
    expect(shown()).toEqual(["ASIDE:pkm", "NAV:pkm"])
  })

  test("without the parameter the remembered trail shows", () => {
    page()
    trail.setupTrail()
    expect(shown()).toEqual(["ASIDE:pkm", "NAV:pkm"])
  })

  test("the next and previous stops of the trail on show are followed", () => {
    page()
    trail.setupTrail()
    const clicked: string[] = []
    dom.document.querySelectorAll("a").forEach((a) => a.addEventListener("click", (e) => (e.preventDefault(), clicked.push(a.getAttribute("href")!))))
    expect(trail.trailStep(1)).toBe(true)
    expect(trail.trailStep(-1)).toBe(true)
    expect(clicked).toEqual(["#c", "#a"])
  })

  test("with no trail on show there is no step", () => {
    dom.document.body.innerHTML = `<nav data-trail="x" hidden><a data-trail-next href="#n">n</a></nav>`
    expect(trail.trailStep(1)).toBe(false)
    expect(trail.trailStep(-1)).toBe(false)
  })

  test("starting a trail remembers it, leaving forgets and hides it, its end forgets it", () => {
    page()
    dom.document.querySelector<HTMLElement>("[data-trail-start] span")!.click()
    expect(dom.window.sessionStorage.getItem("datme-trail")).toBe("cooking")
    trail.setupTrail()
    expect(shown()).toEqual(["ASIDE:cooking", "NAV:cooking"])
    dom.document.querySelector<HTMLElement>("[data-trail-end]")!.click()
    expect(dom.window.sessionStorage.getItem("datme-trail")).toBeNull()

    page()
    dom.window.sessionStorage.setItem("datme-trail", "pkm")
    trail.setupTrail()
    dom.document.querySelector<HTMLElement>("[data-trail-leave]")!.click()
    expect(dom.window.sessionStorage.getItem("datme-trail")).toBeNull()
    expect(shown()).toEqual([])
    // A click anywhere else changes nothing.
    dom.window.sessionStorage.setItem("datme-trail", "pkm")
    dom.document.body.click()
    expect(dom.window.sessionStorage.getItem("datme-trail")).toBe("pkm")
  })

  test("with storage blocked the trail lasts only as long as its links carry it", () => {
    page()
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
      trail.setupTrail()
      expect(shown()).toEqual([])
      dom.window.history.replaceState(null, "", "/notes/b?trail=pkm")
      trail.setupTrail()
      expect(shown()).toEqual(["ASIDE:pkm", "NAV:pkm"])
      expect(() => dom.document.querySelector<HTMLElement>("[data-trail-leave]")!.click()).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", { value: real, configurable: true, writable: true })
    }
  })
})
