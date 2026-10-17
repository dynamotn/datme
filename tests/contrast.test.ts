import { afterEach, describe, expect, test } from "bun:test"
import { contrastRatio, DARK_INK, luminance, onAccent, parseColor } from "../src/lib/contrast"
import { themeCss } from "../src/lib/theme"
import { site } from "../src/site.config"

const ratio = (a: string, b: string) => contrastRatio(luminance(parseColor(a)!), luminance(parseColor(b)!))

describe("colour parsing", () => {
  test("hex in its four lengths", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255])
    expect(parseColor("#0008")).toEqual([0, 0, 0])
    expect(parseColor("#2d6a4f")).toEqual([45, 106, 79])
    expect(parseColor("#2D6A4Fcc")).toEqual([45, 106, 79])
    expect(parseColor("#12345")).toBeUndefined()
  })

  test("rgb() and hsl(), with commas or spaces, numbers or percentages", () => {
    expect(parseColor("rgb(255, 0, 128)")).toEqual([255, 0, 128])
    expect(parseColor("rgba(255 0 128 / 0.5)")).toEqual([255, 0, 128])
    expect(parseColor("rgb(100% 0% 50%)")).toEqual([255, 0, 127.5])
    expect(parseColor("hsl(0, 100%, 50%)")!.map(Math.round)).toEqual([255, 0, 0])
    expect(parseColor("hsl(120 100% 25%)")!.map(Math.round)).toEqual([0, 128, 0])
  })

  test("oklch() and oklab() come back to sRGB", () => {
    expect(parseColor("oklch(1 0 0)")!.map(Math.round)).toEqual([255, 255, 255])
    expect(parseColor("oklab(0 0 0)")!.map(Math.round)).toEqual([0, 0, 0])
    // oklch(62.8% 0.2577 29.23) is sRGB red.
    expect(parseColor("oklch(62.8% 0.2577 29.23)")!.map(Math.round)).toEqual([255, 0, 0])
  })

  test("names and other spaces are not guessed", () => {
    expect(parseColor("teal")).toBeUndefined()
    expect(parseColor("lab(50 20 20)")).toBeUndefined()
  })
})

describe("text on the accent", () => {
  test("luminance and contrast follow WCAG", () => {
    expect(luminance([255, 255, 255])).toBe(1)
    expect(luminance([0, 0, 0])).toBe(0)
    expect(ratio("#fff", "#000")).toBe(21)
    expect(ratio("#777", "#fff")).toBeCloseTo(4.48, 2)
  })

  test("white on a dark accent, dark ink on a light one", () => {
    expect(onAccent("#2d6a4f")).toBe("#fff")
    expect(onAccent("#0047ff")).toBe("#fff")
    expect(onAccent("#6c8dff")).toBe(DARK_INK)
    expect(onAccent("#82c7a0")).toBe(DARK_INK)
    expect(onAccent("hsl(50 100% 50%)")).toBe(DARK_INK)
    expect(onAccent("teal")).toBeUndefined()
  })

  test("the choice always reads at 4.5:1 or better for these accents", () => {
    for (const accent of ["#2d6a4f", "#0047ff", "#6c8dff", "#82c7a0", "#9cc47f", "#7c3aed", "#c4b5fd", "#ffe800"]) {
      expect(ratio(onAccent(accent)!, accent)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe("the theme's CSS", () => {
  const before = site.theme
  afterEach(() => void (site.theme = before))

  test("carries a text colour for each scheme's accent", () => {
    site.theme = { ...before, accent: { light: "#7c3aed", dark: "#c4b5fd" }, fonts: {} }
    const css = themeCss()
    expect(css).toContain(":root:root, :root[data-look][data-look]{--accent:#7c3aed;--accent-2:#7c3aed;")
    expect(css).toMatch(/:root:root[^}]*--on-accent:#fff/)
    expect(css).toMatch(new RegExp(`\\[data-theme="dark"\\]\\{[^}]*--on-accent:${DARK_INK}`))
  })

  test("an accent it cannot read keeps the look's own text colour", () => {
    site.theme = { ...before, accent: "teal", fonts: {} }
    expect(themeCss()).not.toContain("--on-accent")
  })
})
