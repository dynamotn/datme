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
