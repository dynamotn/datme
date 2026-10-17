import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const notebook = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/notebook.css"), "utf8")

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`)
  expect(at).toBeGreaterThanOrEqual(0)
  return css.slice(at, css.indexOf("}", at))
}

describe("notebook look", () => {
  test("a heading strip keeps a line of its own, even right after another heading", () => {
    const h2 = rule(notebook, '[data-look="notebook"] .prose h2')
    expect(h2).not.toMatch(/display:\s*inline/)
    expect(h2).toMatch(/width:\s*fit-content/)
  })
})

/** Every selector of a look's stylesheet starts with that look's own `[data-look=…]`. */
function expectScoped(file: string, look: string) {
  const css = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  const selectors = [...css.matchAll(/([^{};]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((s) => !s.startsWith("@") && !/^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(s))
  expect(selectors.length).toBeGreaterThan(0)
  for (const list of selectors) for (const one of list.split(",")) expect(one.trim()).toStartWith(`[data-look="${look}"]`)
}

describe("garden look", () => {
  test("every rule is scoped to the garden look", () => {
    expectScoped("garden.css", "garden")
  })
})

describe("resume look", () => {
  test("every rule is scoped to the resume look", () => {
    expectScoped("resume.css", "resume")
  })

  test("a résumé prints on white paper, even from dark mode", () => {
    const print = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/print.css"), "utf8")
    expect(print).toContain('[data-look="resume"][data-theme="dark"]')
  })
})

describe("darkroom look", () => {
  test("every rule is scoped to the darkroom look", () => {
    expectScoped("darkroom.css", "darkroom")
  })
})

describe("the monospace font", () => {
  const css = (file: string) => fs.readFileSync(path.resolve(import.meta.dir, "../src/styles", file), "utf8")
  test("falls back to local faces sized to Iosevka's metrics, right after it in both looks", () => {
    const global = css("global.css")
    const faces = [...global.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]).filter((f) => f.includes("Iosevka Dynamo Fallback"))
    expect(faces).toHaveLength(2)
    const pct = (face: string, d: string) => Number(face.match(new RegExp(`${d}:\\s*([\\d.]+)%`))![1]) / 100
    expect(faces.every((f) => /src:\s*local\(/.test(f) && pct(f, "line-gap-override") === 0)).toBe(true)
    // Half an em wide: each local face's advance (Consolas 1126, Menlo 1233 of 2048) times its adjustment.
    const [consolas, menlo] = faces
    expect(pct(consolas, "size-adjust") * (1126 / 2048)).toBeCloseTo(0.5, 3)
    expect(pct(menlo, "size-adjust") * (1233 / 2048)).toBeCloseTo(0.5, 3)
    // 0.965em above the baseline and 0.285em below, once adjusted.
    for (const face of faces) {
      expect(pct(face, "ascent-override") * pct(face, "size-adjust")).toBeCloseTo(0.965, 3)
      expect(pct(face, "descent-override") * pct(face, "size-adjust")).toBeCloseTo(0.285, 3)
    }
    const stack = '"Iosevka Dynamo", "Iosevka Dynamo Fallback Consolas", "Iosevka Dynamo Fallback", ui-monospace, monospace'
    expect(global).toContain(`--font-code: ${stack};`)
    expect(css("notebook.css")).toContain(`--font-mono: ${stack};`)
  })
})
