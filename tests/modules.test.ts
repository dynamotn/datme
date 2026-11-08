import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import path from "node:path"
import { installDom, type Dom } from "./client-dom"

/**
 * Coverage counts only the files some test loads: a module no test imports
 * would pass the 100% gate unseen. This loads every module of src/ (the
 * .astro files are Astro's to compile, the .d.ts files have no code), so one
 * that no test runs shows up uncovered.
 */

// What Vite and Astro provide in a build, as the tests of these scripts mock it.
mock.module("astro:transitions/client", () => ({ navigate: () => {} }))
mock.module("katex/dist/katex.min.css?url", () => ({ default: "/assets/katex.css" }))
mock.module("leaflet/dist/leaflet.css?url", () => ({ default: "/assets/leaflet.css" }))
mock.module("excalifont/fonts/Excalifont-Regular.woff2?url", () => ({ default: "/assets/excalifont.woff2" }))

const src = path.resolve(import.meta.dir, "../src")
const modules = [...new Bun.Glob("**/*.{ts,js,mjs}").scanSync(src)].filter((f) => !f.endsWith(".d.ts")).sort()

// Client scripts reach for the page as they load.
let dom: Dom
beforeAll(() => {
  dom = installDom()
})
afterAll(() => dom.restore())

test("src/ has modules to load", () => {
  expect(modules).toContain("cli.ts")
  expect(modules).toContain("scripts/app.ts")
})

test.each(modules)("src/%s loads", async (file) => {
  expect(await import(path.join(src, file))).toBeDefined()
})
