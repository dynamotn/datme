import { describe, expect, spyOn, test } from "bun:test"
import { Window } from "happy-dom"
import { applyPrefs, parsePrefs, setupPrefs, step, SIZES } from "../src/scripts/prefs"
import { langDir } from "../src/lib/i18n"

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
