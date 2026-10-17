import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"

// Vite turns the ?url import into the font's address; here it is a fixed one.
mock.module("excalifont/fonts/Excalifont-Regular.woff2?url", () => ({ default: "/assets/excalifont.woff2" }))

type Fonts = typeof import("../src/scripts/excalifont")
let dom: Dom
let fonts: Fonts
const added: FakeFace[] = []
let failLoad = false

class FakeFace {
  constructor(
    public family: string,
    public source: string,
    public descriptors: object,
  ) {}
  load() {
    return failLoad ? Promise.reject(new Error("offline")) : Promise.resolve(this)
  }
}
const fontSet = {
  *[Symbol.iterator]() {
    yield* added
  },
  add(f: FakeFace) {
    added.push(f)
  },
}

beforeAll(async () => {
  dom = installDom("https://garden.example/drawing", { FontFace: FakeFace })
  Object.defineProperty(dom.document, "fonts", { value: fontSet, configurable: true })
  fonts = await import("../src/scripts/excalifont")
})
afterAll(() => {
  // The document is shared with the other test files: take the fake font set away again.
  delete (dom.document as unknown as Record<string, unknown>).fonts
  dom.restore()
})

const links = () => [...dom.document.querySelectorAll<HTMLLinkElement>("link[data-drawing-fonts]")].map((l) => l.href)

describe("drawing fonts", () => {
  test("Excalifont is added once, and a failed download is ignored", async () => {
    failLoad = true
    dom.document.body.innerHTML = `<svg class="drawing generated"><text font-family="Excalifont">hi</text></svg>`
    fonts.loadDrawingFonts()
    fonts.loadDrawingFonts()
    await Promise.resolve()
    expect(added).toHaveLength(1)
    expect(added[0].family).toBe("Excalifont")
    expect(added[0].source).toBe(`url(/assets/excalifont.woff2) format("woff2")`)
    expect(added[0].descriptors).toEqual({ display: "swap" })
    expect(links()).toEqual([])
  })

  test("Nunito and Lilita One come from Google Fonts in one stylesheet, linked once", () => {
    dom.document.body.innerHTML = `<svg class="drawing generated"><text font-family="Nunito, sans-serif">a</text><text font-family="Lilita One">b</text></svg>`
    fonts.loadDrawingFonts()
    fonts.loadDrawingFonts()
    expect(links()).toEqual(["https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&family=Lilita+One&display=swap"])
  })

  test("a browser without the font loading API is left alone", () => {
    const doc = dom.document as unknown as Record<string, unknown>
    delete doc.fonts
    dom.document.head.innerHTML = ""
    fonts.loadDrawingFonts()
    expect(links()).toEqual([])
  })
})
