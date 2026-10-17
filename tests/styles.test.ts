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
