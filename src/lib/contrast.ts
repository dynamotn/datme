/**
 * Text colours that stay readable on a configured accent: white on a dark
 * accent, near-black on a light one, by WCAG relative luminance.
 */

/** Ink for text on a light accent; white goes on a dark one. */
export const DARK_INK = "#0b0b0a"

type Rgb = [number, number, number]

const channel = (v: string, scale = 255): number => {
  const n = parseFloat(v)
  return v.trim().endsWith("%") ? (n / 100) * 255 : (n / scale) * 255
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  // Back to gamma-encoded sRGB, clipped to the gamut.
  return lin.map((c) => {
    const v = Math.min(1, Math.max(0, c))
    return (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255
  }) as Rgb
}

/** The sRGB channels (0-255) of a hex, rgb(), hsl(), oklab() or oklch() colour; undefined for others. */
export function parseColor(color: string): Rgb | undefined {
  const c = color.trim().toLowerCase()
  const hex = c.match(/^#([0-9a-f]{3,8})$/)?.[1]
  if (hex) {
    if (hex.length === 3 || hex.length === 4) return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)) as Rgb
    if (hex.length === 6 || hex.length === 8) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
    return undefined
  }
  const fn = c.match(/^(rgba?|hsla?|oklab|oklch)\(([^)]*)\)$/)
  if (!fn) return undefined
  const args = fn[2].split(/[\s,/]+/).filter(Boolean)
  if (args.length < 3 || args.slice(0, 3).some((a) => Number.isNaN(parseFloat(a)))) return undefined
  const [x, y, z] = args
  const unit = (v: string, full: number) => (v.endsWith("%") ? (parseFloat(v) / 100) * full : parseFloat(v))
  switch (fn[1]) {
    case "rgb":
    case "rgba":
      return [channel(x), channel(y), channel(z)]
    case "hsl":
    case "hsla":
      return hslToRgb(((parseFloat(x) % 360) + 360) % 360, unit(y, 100) / 100, unit(z, 100) / 100)
    case "oklab":
      return oklabToRgb(unit(x, 1), unit(y, 0.4), unit(z, 0.4))
    default: {
      const h = (parseFloat(z) * Math.PI) / 180
      const ch = unit(y, 0.4)
      return oklabToRgb(unit(x, 1), ch * Math.cos(h), ch * Math.sin(h))
    }
  }
}

/** WCAG relative luminance of sRGB channels (0-255). */
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = Math.min(255, Math.max(0, v)) / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio of two luminances. */
export const contrastRatio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * White or near-black, whichever reads better on the accent; undefined when
 * the colour cannot be parsed, so the look's own default stays.
 */
export function onAccent(accent: string): string | undefined {
  const rgb = parseColor(accent)
  if (!rgb) return undefined
  const l = luminance(rgb)
  const dark = luminance(parseColor(DARK_INK)!)
  return contrastRatio(l, 1) >= contrastRatio(l, dark) ? "#fff" : DARK_INK
}

/** The contrast WCAG AA asks of body text, links included. */
export const AA_TEXT = 4.5

/** WCAG contrast ratio of two colours; undefined when either cannot be parsed. */
export function contrastOf(a: string, b: string): number | undefined {
  const x = parseColor(a)
  const y = parseColor(b)
  return x && y ? contrastRatio(luminance(x), luminance(y)) : undefined
}

/** A colour as #rrggbb. */
const toHex = (rgb: Rgb) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")

/**
 * The accent nearest to `accent`, darkened towards black or lightened towards white (whichever moves it away
 * from the grounds), that reaches `min` on each of `grounds`; undefined when it already does or cannot.
 */
export function readableAccent(accent: string, grounds: readonly string[], min = AA_TEXT): string | undefined {
  const rgb = parseColor(accent)
  const lums = grounds.map(parseColor).filter((g): g is Rgb => !!g).map(luminance)
  if (!rgb || !lums.length) return undefined
  const passes = (c: Rgb) => lums.every((l) => contrastRatio(luminance(c), l) >= min)
  if (passes(rgb)) return undefined
  // Grounds lighter than the accent on average want it darker, darker ones want it lighter.
  const darker = lums.reduce((a, b) => a + b, 0) / lums.length > luminance(rgb)
  for (let step = 1; step <= 100; step++) {
    const t = step / 100
    // Judged as written: rounding to #rrggbb can cost a hair of contrast.
    const next = toHex(rgb.map((v) => (darker ? v * (1 - t) : v + (255 - v) * t)) as Rgb)
    if (passes(parseColor(next)!)) return next
  }
  return undefined
}
