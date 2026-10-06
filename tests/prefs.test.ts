import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { applyPrefs, parsePrefs, step, SIZES } from "../src/scripts/prefs"
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
