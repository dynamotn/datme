import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { resolveConfig, ConfigError } from "../src/site.config"
import { canTurnPages, LOOK_SCRIPT, readerLooks } from "../src/lib/look-switch"
import { applyLook, LOOK_KEY, setupLookSwitch } from "../src/scripts/looks"
import { installDom, type Dom } from "./client-dom"

describe("appearance.readerSwitch", () => {
  test("off by default; true offers every style that only recolours a page", () => {
    expect(resolveConfig({}, "/v").appearance.readerSwitch).toEqual([])
    expect(resolveConfig({ appearance: { readerSwitch: true } }, "/v").appearance.readerSwitch).toEqual([
      "notebook",
      "classic",
      "garden",
      "terminal",
      "blueprint",
      "manuscript",
      "lacquer",
      "zine",
      "eink",
      "paddy",
    ])
  })
  test("a list of styles, once each", () => {
    expect(resolveConfig({ appearance: { readerSwitch: ["classic", "garden", "classic"] } }, "/v").appearance.readerSwitch).toEqual(["classic", "garden"])
  })
  test("a style made for a single page, or no style, is an error", () => {
    expect(() => resolveConfig({ appearance: { readerSwitch: ["classic", "resume"] } }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ appearance: { readerSwitch: ["darkroom"] } }, "/v")).toThrow("darkroom is made for a single page")
    expect(() => resolveConfig({ appearance: { readerSwitch: [] } }, "/v")).toThrow()
    expect(() => resolveConfig({ appearance: { readerSwitch: ["fancy"] } }, "/v")).toThrow()
  })
  test("a style that lays its pages out its own way is an error", () => {
    for (const style of ["wiki", "broadsheet", "herbarium", "atlas", "catalog"]) {
      expect(() => resolveConfig({ appearance: { readerSwitch: ["classic", style] } }, "/v")).toThrow(`${style} lays its pages out its own way`)
    }
  })
})

describe("canTurnPages", () => {
  test("a note in the e-ink style, or one the switch can draw in it", () => {
    expect(canTurnPages("eink", [])).toBe(true)
    expect(canTurnPages("classic", [])).toBe(false)
    expect(canTurnPages("classic", ["notebook", "eink"])).toBe(true)
    expect(canTurnPages("classic", ["notebook"])).toBe(false)
    // A page the switch leaves alone keeps to its own style.
    expect(canTurnPages("wiki", ["eink"])).toBe(false)
    // The fixture leaves the switch off.
    expect(canTurnPages("notebook")).toBe(false)
  })
})

describe("readerLooks", () => {
  const sheets: Record<string, string[]> = { notebook: ["/n.css"], garden: ["/g.css"] }
  const draw = (st: string) => [st === "ink" ? "classic" : st, ...(sheets[st] ?? [])]
  test("the page's own style, then the choices, each with the look it sets and its stylesheet", () => {
    expect(readerLooks("classic", draw, ["notebook", "garden"])).toEqual({ classic: ["classic"], notebook: ["notebook", "/n.css"], garden: ["garden", "/g.css"] })
  })
  test("none when the switch is off or the page is a résumé or a gallery", () => {
    expect(readerLooks("classic", draw, [])).toBeUndefined()
    expect(readerLooks("resume", draw, ["notebook"])).toBeUndefined()
    // A front page, an infobox or a specimen label would lose its frame in another style.
    for (const own of ["broadsheet", "wiki", "herbarium"]) expect(readerLooks(own, draw, ["notebook"])).toBeUndefined()
    // The fixture leaves the switch off.
    expect(readerLooks("notebook", draw)).toBeUndefined()
  })
})

let dom: Dom
beforeAll(() => {
  dom = installDom("https://garden.example/")
})
afterAll(() => dom.restore())

const LOOKS = { classic: ["classic"], notebook: ["notebook", "/n.css"], garden: ["garden", "/g.css"] }
/** A page drawn in `own`, its stylesheets as Base.astro links them. */
function page(doc: Document, own: string, looks: Record<string, string[]> | null = LOOKS) {
  const root = doc.documentElement
  root.dataset.look = own
  root.removeAttribute("data-reader-looks")
  if (looks) {
    root.dataset.readerLooks = JSON.stringify(looks)
    root.dataset.lookOwn = own
  }
  const sheet = looks?.[own]?.[1]
  doc.head.innerHTML = `<link rel="stylesheet" href="/global.css" data-css="2">${sheet ? `<link rel="stylesheet" href="${sheet}" data-css="3" data-look-css>` : ""}<link rel="stylesheet" href="/print.css" data-css="4">`
}
const hrefs = (doc: Document) => [...doc.head.querySelectorAll("link")].map((l) => l.getAttribute("href"))

describe("applyLook", () => {
  test("a classic page in the notebook: the look's sheet is added after the base", () => {
    page(document, "classic")
    applyLook(document, "notebook")
    expect(document.documentElement.dataset.look).toBe("notebook")
    expect(hrefs(document)).toEqual(["/global.css", "/n.css", "/print.css"])
    const added = document.querySelector<HTMLLinkElement>("link[data-look-css]")!
    expect(added.getAttribute("blocking")).toBe("render")
    expect(added.dataset.css).toBe("3")
  })
  test("a notebook page in the garden reuses the link; in classic it drops it", () => {
    page(document, "notebook")
    const link = document.querySelector("link[data-look-css]")
    applyLook(document, "garden")
    expect(document.querySelector("link[data-look-css]")).toBe(link)
    expect(hrefs(document)).toEqual(["/global.css", "/g.css", "/print.css"])
    applyLook(document, "garden")
    expect(hrefs(document)).toEqual(["/global.css", "/g.css", "/print.css"])
    applyLook(document, "classic")
    expect(hrefs(document)).toEqual(["/global.css", "/print.css"])
    expect(document.documentElement.dataset.look).toBe("classic")
  })
  test("no choice, or one not offered, is the page's own style", () => {
    page(document, "notebook")
    applyLook(document, "darkroom")
    expect(document.documentElement.dataset.look).toBe("notebook")
    applyLook(document, null)
    expect(hrefs(document)).toEqual(["/global.css", "/n.css", "/print.css"])
  })
  test("a page without the switch is left alone", () => {
    page(document, "resume", null)
    applyLook(document, "garden")
    expect(document.documentElement.dataset.look).toBe("resume")
  })
  test("a head without the base sheet gets the look's at its end", () => {
    page(document, "classic")
    document.head.innerHTML = ""
    applyLook(document, "garden")
    expect(hrefs(document)).toEqual(["/g.css"])
  })
})

describe("the <head> script", () => {
  const run = () => new Function(LOOK_SCRIPT)()
  test("draws the page in the stored style before it shows, and the next page before the swap", () => {
    page(document, "classic")
    localStorage.setItem(LOOK_KEY, "garden")
    run()
    expect(document.documentElement.dataset.look).toBe("garden")
    expect(hrefs(document)).toEqual(["/global.css", "/g.css", "/print.css"])
    const next = document.implementation.createHTMLDocument("next")
    page(next, "notebook")
    const swap = (doc: Document) => document.dispatchEvent(Object.assign(new Event("astro:before-swap"), { newDocument: doc }))
    swap(next)
    expect(next.documentElement.dataset.look).toBe("garden")
    expect(hrefs(next)).toEqual(["/global.css", "/g.css", "/print.css"])
    // A page without the switch, swapped in, stays as it is.
    const plain = document.implementation.createHTMLDocument("plain")
    page(plain, "resume", null)
    swap(plain)
    expect(plain.documentElement.dataset.look).toBe("resume")
  })
  test("adds a missing sheet; with storage blocked, keeps the page's own", () => {
    page(document, "classic")
    localStorage.setItem(LOOK_KEY, "notebook")
    run()
    expect(hrefs(document)).toEqual(["/global.css", "/n.css", "/print.css"])
    document.head.innerHTML = ""
    localStorage.setItem(LOOK_KEY, "garden")
    page(document, "classic")
    document.head.querySelector('link[data-css="2"]')!.remove()
    run()
    expect(hrefs(document)).toEqual(["/print.css", "/g.css"])
    const real = globalThis.localStorage
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => { throw new Error("blocked") } }, configurable: true, writable: true })
    try {
      page(document, "notebook")
      run()
      expect(document.documentElement.dataset.look).toBe("notebook")
    } finally {
      Object.defineProperty(globalThis, "localStorage", { value: real, configurable: true, writable: true })
    }
  })
})

describe("the style menu", () => {
  const menu = () => {
    document.body.innerHTML = `<div data-look-switch>
      <label><input type="radio" name="reader-look" value="" data-look-pick></label>
      <label><input type="radio" name="reader-look" value="notebook" data-look-pick></label>
      <label><input type="radio" name="reader-look" value="garden" data-look-pick></label>
      <input type="checkbox" class="other">
    </div>`
    return [...document.querySelectorAll<HTMLInputElement>("input")]
  }
  const pick = (i: HTMLInputElement) => {
    i.checked = true
    i.dispatchEvent(new dom.window.Event("change", { bubbles: true }))
  }
  test("checks the stored style, or the page's own when it is no longer offered", () => {
    page(document, "classic")
    localStorage.setItem(LOOK_KEY, "garden")
    let [own, , garden] = menu()
    setupLookSwitch()
    expect(garden.checked).toBe(true)
    localStorage.setItem(LOOK_KEY, "darkroom")
    ;[own] = menu()
    setupLookSwitch()
    expect(own.checked).toBe(true)
  })
  test("a pick is applied and remembered; the author's choice forgets it", () => {
    page(document, "classic")
    localStorage.clear()
    const [own, notebook, , other] = menu()
    setupLookSwitch()
    expect(own.checked).toBe(true)
    pick(notebook)
    expect(localStorage.getItem(LOOK_KEY)).toBe("notebook")
    expect(document.documentElement.dataset.look).toBe("notebook")
    other.dispatchEvent(new dom.window.Event("change", { bubbles: true }))
    expect(localStorage.getItem(LOOK_KEY)).toBe("notebook")
    pick(own)
    expect(localStorage.getItem(LOOK_KEY)).toBeNull()
    expect(document.documentElement.dataset.look).toBe("classic")
  })
  test("a page without the menu, or a menu already bound, is left alone; blocked storage lasts the page", () => {
    document.body.innerHTML = ""
    expect(() => setupLookSwitch()).not.toThrow()
    page(document, "classic")
    const [, notebook] = menu()
    setupLookSwitch()
    setupLookSwitch()
    const real = globalThis.localStorage
    const blocked = {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
    }
    Object.defineProperty(globalThis, "localStorage", { value: blocked, configurable: true, writable: true })
    try {
      pick(notebook)
      expect(document.documentElement.dataset.look).toBe("notebook")
      const [own] = menu()
      setupLookSwitch()
      expect(own.checked).toBe(true)
    } finally {
      Object.defineProperty(globalThis, "localStorage", { value: real, configurable: true, writable: true })
    }
  })
})
