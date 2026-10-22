import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { AA_TEXT, contrastOf, contrastRatio, DARK_INK, luminance, onAccent, parseColor, readableAccent } from "../src/lib/contrast"
import { themeCss } from "../src/lib/theme"
import { site, STYLES } from "../src/site.config"

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

/**
 * The variables a look's stylesheet gives one scheme: its light block, with
 * the dark block over it for "dark". An accent passed in replaces the look's
 * own, as theme.accent does.
 */
function palette(look: string, scheme: "light" | "dark", accent?: string): Record<string, string> {
  const css = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles", `${look}.css`), "utf8")
  const block = (selector: string) => {
    const at = css.indexOf(`${selector} {`)
    const vars: Record<string, string> = {}
    for (const m of css.slice(at, css.indexOf("}", at)).matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim()
    return vars
  }
  const vars = { ...block(`[data-look="${look}"]`), ...(scheme === "dark" ? block(`[data-look="${look}"][data-theme="dark"]`) : {}) }
  if (accent) vars["--accent"] = accent
  return vars
}

/** A colour of a palette as sRGB: a hex, a var() of the palette, or a color-mix() of the two in srgb. */
function resolve(vars: Record<string, string>, value: string): [number, number, number] {
  const ref = value.match(/^var\((--[\w-]+)\)$/)
  if (ref) return resolve(vars, vars[ref[1]])
  const mix = value.match(/^color-mix\(in srgb, (.+) (\d+)%, (.+)\)$/)
  if (mix) {
    const [a, b, p] = [resolve(vars, mix[1]), resolve(vars, mix[3]), Number(mix[2]) / 100]
    return a.map((c, i) => c * p + b[i] * (1 - p)) as [number, number, number]
  }
  return parseColor(value)!
}

/** Contrast of two variables of a palette. */
function contrast(vars: Record<string, string>, fg: string, bg: string): number {
  return contrastRatio(luminance(resolve(vars, vars[fg])), luminance(resolve(vars, vars[bg])))
}

describe("the looks' own palettes", () => {
  // Text and its grounds; the accent colours links and headings, so it must read on the page too.
  const TEXT = ["--ink", "--ink-2", "--muted", "--accent"]
  const GROUNDS = ["--bg", "--surface"]
  const LOOKS = ["terminal", "blueprint", "wiki", "broadsheet"]

  for (const look of LOOKS) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${look} reads at 4.5:1 or better in ${scheme} mode`, () => {
        const vars = palette(look, scheme)
        for (const fg of TEXT) for (const bg of GROUNDS) expect({ fg, bg, ok: contrast(vars, fg, bg) >= 4.5 }).toEqual({ fg, bg, ok: true })
      })
    }
  }

  test("the terminal's text stays readable whatever the accent", () => {
    // Its text is mixed from the accent, toward white on the screen and black on paper.
    for (const accent of ["#000000", "#ffffff", "#7c3aed", "#ffb000", "#0047ff"]) {
      for (const scheme of ["light", "dark"] as const) {
        const vars = palette("terminal", scheme, accent)
        for (const fg of ["--ink", "--ink-2", "--muted"]) {
          expect({ accent, scheme, fg, ok: contrast(vars, fg, "--bg") >= 4.5 }).toEqual({ accent, scheme, fg, ok: true })
        }
      }
    }
  })
})

/** Custom properties of each rule of a look's stylesheet, by selector. */
function rules(file: string): Map<string, Record<string, string>> {
  const css = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  const out = new Map<string, Record<string, string>>()
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars = Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
    // A leading @import ends at its semicolon.
    const sel = selector.split(";").at(-1)!.trim()
    out.set(sel, { ...out.get(sel), ...vars })
  }
  return out
}

/** The palette the given rules make together over an inherited one, later ones winning, with var() references followed. */
function sheetPalette(file: string, selectors: string[], inherited: Record<string, string> = {}): Record<string, string> {
  const all = rules(file)
  const merged: Record<string, string> = Object.assign({ ...inherited }, ...selectors.map((sel) => all.get(sel) ?? {}))
  const resolve = (v: string): string => v.replace(/^var\((--[\w-]+)\)$/, (_, name) => resolve(merged[name]))
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, resolve(v)]))
}

/** A see-through ground, such as `rgb(0 0 0 / 0.12)`, as it shows over the page; an opaque one as it is. */
function overPage(color: string, page: string): string {
  const alpha = color.match(/^rgba?\([^)]*\/\s*([\d.]+)(%?)\s*\)$/)
  if (!alpha) return color
  const a = parseFloat(alpha[1]) / (alpha[2] ? 100 : 1)
  const [top, under] = [parseColor(color)!, parseColor(page)!]
  return `rgb(${top.map((c, i) => Math.round(c * a + under[i] * (1 - a))).join(" ")})`
}

/** Text colours a look sets that read under WCAG AA on a ground it sets; none should be listed. */
function unreadable(name: string, p: Record<string, string>): string[] {
  const out: string[] = p["--bg"] ? [] : [`${name}: no palette`]
  const check = (fg: string, bg: string) => {
    if (!p[fg] || !p[bg]) return
    const ground = overPage(p[bg], p["--bg"])
    if (ratio(p[fg], ground) < 4.5) out.push(`${name}: ${fg} on ${bg} is ${ratio(p[fg], ground).toFixed(2)}:1`)
  }
  for (const fg of ["--ink", "--ink-2", "--muted", "--accent", "--earth", "--clay"])
    for (const bg of ["--bg", "--surface", "--surface-2", "--label", "--box-1", "--box-2", "--box-3", "--box-4", "--mark", "--land", "--sea"]) check(fg, bg)
  check("--on-accent", "--accent")
  return out
}

describe("the palettes of the looks", () => {
  test("herbarium, manuscript and lacquer read at AA in both schemes", () => {
    for (const look of ["herbarium", "manuscript", "lacquer"]) {
      const light = `[data-look="${look}"]`
      expect(unreadable(`${look} light`, sheetPalette(`${look}.css`, [light]))).toEqual([])
      expect(unreadable(`${look} dark`, sheetPalette(`${look}.css`, [light, `${light}[data-theme="dark"]`]))).toEqual([])
    }
  })

  test("zine, atlas and catalog read at AA in both schemes, on their boxes, land and sea too", () => {
    for (const look of ["zine", "atlas", "catalog"]) {
      const light = `[data-look="${look}"]`
      expect(unreadable(`${look} light`, sheetPalette(`${look}.css`, [light]))).toEqual([])
      expect(unreadable(`${look} dark`, sheetPalette(`${look}.css`, [light, `${light}[data-theme="dark"]`]))).toEqual([])
    }
  })

  test("eink reads at AA in both schemes, its accent ink included", () => {
    const light = '[data-look="eink"]'
    const ink = '[data-look="eink"][data-look="eink"][data-look="eink"]'
    const dark = [`${light}[data-theme="dark"]`, '[data-look="eink"][data-look="eink"][data-theme="dark"]']
    expect(unreadable("eink light", sheetPalette("eink.css", [light, ink]))).toEqual([])
    expect(unreadable("eink dark", sheetPalette("eink.css", [light, ink, ...dark]))).toEqual([])
  })

  test("eink has no colour: every colour it sets is a grey", () => {
    const css = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/eink.css"), "utf8")
    for (const [hex] of css.matchAll(/#[0-9a-f]{6}\b/gi)) {
      const [r, g, b] = parseColor(hex)!
      expect({ hex, grey: r === g && g === b }).toEqual({ hex, grey: true })
    }
    for (const m of css.matchAll(/rgb\((\d+) (\d+) (\d+)/g)) expect(new Set(m.slice(1)).size).toBe(1)
  })

  test("paddy reads at AA in both schemes, on its page and on the field of every stage", () => {
    const light = '[data-look="paddy"]'
    expect(unreadable("paddy light", sheetPalette("paddy.css", [light]))).toEqual([])
    expect(unreadable("paddy dark", sheetPalette("paddy.css", [light, `${light}[data-theme="dark"]`]))).toEqual([])
    for (const scheme of ["light", "dark"] as const) {
      const vars = palette("paddy", scheme)
      for (const bg of ["--field-0", "--field-1", "--field-2", "--field-3", "--field-none"]) {
        for (const fg of ["--ink", "--ink-2", "--muted", "--earth", "--accent"]) {
          expect({ scheme, fg, bg, ok: contrast(vars, fg, bg) >= 4.5 }).toEqual({ scheme, fg, bg, ok: true })
        }
      }
    }
  })

  test("every season of the garden reads at AA in both schemes", () => {
    const light = '[data-look="garden"]'
    const dark = '[data-look="garden"][data-theme="dark"]'
    for (const season of ["spring", "summer", "autumn", "winter"]) {
      const where = `:where([data-season="${season}"])`
      expect(unreadable(`${season} light`, sheetPalette("garden.css", [light, light + where]))).toEqual([])
      // In cascade order: the dark rules outrank the light season, whatever their place in the file.
      expect(unreadable(`${season} dark`, sheetPalette("garden.css", [light, light + where, dark, dark + where]))).toEqual([])
    }
  })
})

describe("chips: the accent on its own soft tint", () => {
  // Links between notes, the stack of a project and the current page of a menu draw the accent on --accent-soft; the tint
  // sits on the page or on a card, and darkens or lightens the ground the accent has to read on.
  test("reads at AA over the page and the cards, in every look and both schemes", () => {
    const out: string[] = []
    for (const look of STYLES) {
      const own = look === "classic" ? undefined : `[data-look="${look}"]`
      // A look sets what it changes; the rest is global.css's.
      const base = sheetPalette("global.css", [":root"])
      const dark = sheetPalette("global.css", [":root", ':root[data-theme="dark"]'])
      const schemes = {
        light: own ? sheetPalette(`${look}.css`, [own], base) : base,
        dark: own ? sheetPalette(`${look}.css`, [own, `${own}[data-theme="dark"]`], dark) : dark,
      }
      for (const [scheme, p] of Object.entries(schemes)) {
        for (const ground of ["--bg", "--surface"]) {
          // The terminal mixes its tint from whatever accent it has.
          const soft = p["--accent-soft"].replace(
            /^color-mix\(in srgb, var\(--accent\) (\d+)%, transparent\)$/,
            (_, n) => `rgb(${parseColor(p["--accent"])!.join(" ")} / ${n}%)`,
          )
          const chip = overPage(soft, overPage(p[ground], p["--bg"]))
          const r = ratio(p["--accent"], chip)
          if (r < AA_TEXT) out.push(`${look} ${scheme}: --accent on --accent-soft over ${ground} is ${r.toFixed(2)}:1`)
        }
      }
    }
    expect(out).toEqual([])
  })
})

describe("an accent readable on its grounds", () => {
  test("contrastOf: the ratio of two colours, none for a colour not parsed", () => {
    expect(contrastOf("#000", "#fff")).toBe(21)
    expect(contrastOf("teal", "#fff")).toBeUndefined()
  })
  test("a faint accent is darkened on light grounds, lightened on dark ones, until it passes on each", () => {
    const darker = readableAccent("#ffcc00", ["#f5f5f0", "#f4ecdb"])!
    expect(ratio(darker, "#f5f5f0")).toBeGreaterThanOrEqual(AA_TEXT)
    expect(ratio(darker, "#f4ecdb")).toBeGreaterThanOrEqual(AA_TEXT)
    expect(luminance(parseColor(darker)!)).toBeLessThan(luminance(parseColor("#ffcc00")!))
    const lighter = readableAccent("#333333", ["#121211"])!
    expect(ratio(lighter, "#121211")).toBeGreaterThanOrEqual(AA_TEXT)
    expect(lighter).toMatch(/^#[0-9a-f]{6}$/)
  })
  test("nothing for an accent that passes, one not parsed, or grounds no colour can serve at once", () => {
    expect(readableAccent("#7c3aed", ["#f5f5f0"])).toBeUndefined()
    expect(readableAccent("teal", ["#f5f5f0"])).toBeUndefined()
    expect(readableAccent("#777", ["teal"])).toBeUndefined()
    expect(readableAccent("#777", ["#fff", "#000", "#777"])).toBeUndefined()
  })
})
