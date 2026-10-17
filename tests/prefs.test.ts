import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { Window } from "happy-dom"
import { applyPrefs, parsePrefs, setupPrefs, step, SIZES } from "../src/scripts/prefs"
import { langDir } from "../src/lib/i18n"
import { installDom, type Dom } from "./client-dom"

describe("reading preferences", () => {
  test("stored preferences are read defensively", () => {
    expect(parsePrefs('{"size":1.3,"legible":true}')).toEqual({ size: 1.3, legible: true, contrast: false })
    expect(parsePrefs('{"size":9}')).toEqual({ size: 1, legible: false, contrast: false })
    expect(parsePrefs("not json")).toEqual({ size: 1, legible: false, contrast: false })
  })

  test("sizes step up and down and stop at the ends", () => {
    expect(step(1, 1)).toBe(1.15)
    expect(step(1, -1)).toBe(0.85)
    expect(step(SIZES.at(-1)!, 1)).toBe(SIZES.at(-1)!)
    expect(step(0.85, -1)).toBe(0.85)
  })

  test("applying sets the text scale and classes, and fetches the legible font once", () => {
    const window = new Window({ url: "https://garden.example/" }) as unknown as globalThis.Window
    const root = window.document.documentElement
    applyPrefs(root, { size: 1.3, legible: true, contrast: true })
    applyPrefs(root, { size: 1.3, legible: true, contrast: true })
    expect(root.style.getPropertyValue("--reading-scale")).toBe("1.3")
    expect([...root.classList].sort()).toEqual(["font-legible", "high-contrast"])
    expect(window.document.querySelectorAll("link[data-legible-font]")).toHaveLength(1)
    applyPrefs(root, { size: 1, legible: false, contrast: false })
    expect(root.classList.length).toBe(0)
  })
})

describe("writing direction", () => {
  test("right-to-left languages by their base tag", () => {
    expect(langDir("ar-EG")).toBe("rtl")
    expect(langDir("he")).toBe("rtl")
    expect(langDir("fa-IR")).toBe("rtl")
    expect(langDir("vi-VN")).toBe("ltr")
    expect(langDir("en-US")).toBe("ltr")
  })
})

describe("the preferences menu", () => {
  test("a click elsewhere closes it, with one listener however often the header is swapped", () => {
    const window = new Window({ url: "https://garden.example/" }) as unknown as globalThis.Window & typeof globalThis
    const document = window.document
    const saved = globalThis.document
    globalThis.document = document
    const listen = spyOn(document, "addEventListener")
    try {
      const header = `<button data-prefs-toggle aria-expanded="false"></button><div data-prefs-panel hidden><output data-pref-size-out></output></div><p>elsewhere</p>`
      for (let i = 0; i < 3; i++) {
        document.body.innerHTML = header
        setupPrefs()
      }
      expect(listen.mock.calls.filter(([type]) => type === "click")).toHaveLength(1)
      document.querySelector<HTMLElement>("[data-prefs-toggle]")!.click()
      expect(document.querySelector<HTMLElement>("[data-prefs-panel]")!.hidden).toBe(false)
      document.querySelector<HTMLElement>("p")!.click()
      expect(document.querySelector<HTMLElement>("[data-prefs-panel]")!.hidden).toBe(true)
      expect(document.querySelector("[data-prefs-toggle]")!.getAttribute("aria-expanded")).toBe("false")
    } finally {
      listen.mockRestore()
      globalThis.document = saved
    }
  })
})

let dom: Dom
const header = () => {
  dom.document.body.innerHTML = `<button data-prefs-toggle aria-expanded="false">Aa</button>
    <div data-prefs-panel hidden>
      <button data-pref-size="-1">A-</button><output data-pref-size-out></output><button data-pref-size="1">A+</button>
      <label><input type="checkbox" data-pref="legible"></label><label><input type="checkbox" data-pref="contrast"></label>
      <input type="text" class="other">
    </div><p>elsewhere</p>`
  const q = <T extends Element>(s: string) => dom.document.querySelector<T>(s)!
  return {
    toggle: q<HTMLButtonElement>("[data-prefs-toggle]"),
    panel: q<HTMLElement>("[data-prefs-panel]"),
    out: q<HTMLElement>("[data-pref-size-out]"),
    up: q<HTMLButtonElement>('[data-pref-size="1"]'),
    down: q<HTMLButtonElement>('[data-pref-size="-1"]'),
    legible: q<HTMLInputElement>('[data-pref="legible"]'),
    contrast: q<HTMLInputElement>('[data-pref="contrast"]'),
  }
}
const change = (i: HTMLInputElement, checked: boolean) => {
  i.checked = checked
  i.dispatchEvent(new dom.window.Event("change", { bubbles: true }))
}
const root = () => dom.document.documentElement
const stored = () => JSON.parse(dom.window.localStorage.getItem("prefs") ?? "null")

describe("the preferences menu, control by control", () => {
  // After the test above: the module closes the menu on a click elsewhere on the document it was first set up on.
  beforeAll(() => {
    dom = installDom("https://garden.example/")
  })
  afterAll(() => dom.restore())

  test("stored preferences that cannot be read fall back to the defaults", () => {
    expect(parsePrefs(null)).toEqual({ size: 1, legible: false, contrast: false })
    expect(step(0.42, 1)).toBe(1.15)
  })

  test("it shows the stored preferences and applies them", () => {
    dom.window.localStorage.setItem("prefs", JSON.stringify({ size: 1.15, legible: false, contrast: true }))
    const h = header()
    setupPrefs()
    expect(h.out.textContent).toBe("115%")
    expect(h.contrast.checked).toBe(true)
    expect(h.legible.checked).toBe(false)
    expect(root().style.getPropertyValue("--reading-scale")).toBe("1.15")
    expect(root().classList.contains("high-contrast")).toBe(true)
  })

  test("the toggle opens and closes it; a click inside it keeps it open", () => {
    const { toggle, panel, out } = header()
    setupPrefs()
    toggle.click()
    expect(panel.hidden).toBe(false)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    out.click()
    expect(panel.hidden).toBe(false)
    toggle.click()
    expect(panel.hidden).toBe(true)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })

  test("size buttons step the text size and remember it", () => {
    dom.window.localStorage.clear()
    const { up, down, out, panel } = header()
    setupPrefs()
    up.click()
    up.click()
    expect(out.textContent).toBe("130%")
    expect(stored()).toEqual({ size: 1.3, legible: false, contrast: false })
    down.click()
    expect(out.textContent).toBe("115%")
    // A click in the menu on anything else changes nothing.
    panel.click()
    expect(stored().size).toBe(1.15)
  })

  test("checkboxes switch the legible font and high contrast", () => {
    dom.window.localStorage.clear()
    const h = header()
    setupPrefs()
    change(h.legible, true)
    expect(stored()).toEqual({ size: 1, legible: true, contrast: false })
    expect(root().classList.contains("font-legible")).toBe(true)
    expect(dom.document.querySelectorAll("link[data-legible-font]")).toHaveLength(1)
    change(h.contrast, true)
    expect(stored().contrast).toBe(true)
    // Other inputs in the menu are not preferences.
    const other = dom.document.querySelector<HTMLInputElement>("input.other")!
    other.dispatchEvent(new dom.window.Event("change", { bubbles: true }))
    expect(Object.keys(stored())).toEqual(["size", "legible", "contrast"])
  })

  test("a page without the menu, or a menu already bound, is left alone", () => {
    dom.document.body.innerHTML = ""
    expect(() => setupPrefs()).not.toThrow()
    const { up, out } = header()
    setupPrefs()
    setupPrefs()
    dom.window.localStorage.clear()
    up.click()
    // One listener: a single step.
    expect(out.textContent).toBe("115%")
  })

  test("with storage blocked the preferences hold for the page only", () => {
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
      const { up, out } = header()
      setupPrefs()
      expect(out.textContent).toBe("100%")
      up.click()
      expect(out.textContent).toBe("115%")
    } finally {
      Object.defineProperty(globalThis, "localStorage", { value: real, configurable: true, writable: true })
    }
  })
})
