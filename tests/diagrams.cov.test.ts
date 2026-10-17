import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"

const scores: { out: HTMLElement; src: string; opts: object }[] = []
mock.module("abcjs", () => ({ default: { renderAbc: (out: HTMLElement, src: string, opts: object) => void scores.push({ out, src, opts }) } }))
const maps: { svg: SVGSVGElement; opts: object; data: unknown; destroyed: boolean }[] = []
mock.module("markmap-view", () => ({
  Markmap: {
    create(svg: SVGSVGElement, opts: object, data: unknown) {
      const mm = { svg, opts, data, destroyed: false, destroy: () => void (mm.destroyed = true) }
      maps.push(mm)
      return mm
    },
  },
}))

type Diagrams = typeof import("../src/scripts/diagrams")
let dom: Dom
let diagrams: Diagrams
beforeAll(async () => {
  dom = installDom("https://garden.example/music")
  diagrams = await import("../src/scripts/diagrams")
})
afterAll(() => dom.restore())

describe("sheet music", () => {
  test("each abc block is typeset after its source, once, with its label", async () => {
    dom.document.body.innerHTML = `<div class="prose"><pre class="abc" aria-label="A tune">X:1\nK:C\nCDEF|</pre><pre class="abc">X:2</pre></div><pre class="abc">outside</pre>`
    await diagrams.renderAbc()
    await diagrams.renderAbc()
    expect(scores.map((s) => s.src)).toEqual(["X:1\nK:C\nCDEF|", "X:2"])
    const outs = [...dom.document.querySelectorAll(".abc-score")]
    expect(outs.map((o) => o.getAttribute("aria-label"))).toEqual(["A tune", "Sheet music"])
    expect(outs[0].previousElementSibling?.hasAttribute("data-drawn")).toBe(true)
    expect(outs[0].getAttribute("role")).toBe("img")
    expect(scores[0].out).toBe(outs[0] as HTMLElement)
    expect(scores[0].opts).toMatchObject({ responsive: "resize", add_classes: true })
  })

  test("a page without any loads nothing", async () => {
    scores.length = 0
    dom.document.body.innerHTML = `<div class="prose"><p>No music</p></div>`
    await diagrams.renderAbc(dom.document.body)
    expect(scores).toEqual([])
  })

  test("an empty block still gets a score", async () => {
    scores.length = 0
    const root = dom.document.createElement("div")
    root.innerHTML = `<div class="prose"><pre class="abc"></pre></div>`
    const pre = root.querySelector("pre")!
    Object.defineProperty(pre, "textContent", { get: () => null, configurable: true })
    await diagrams.renderAbc(root)
    expect(scores.map((s) => s.src)).toEqual([""])
  })
})

describe("mind maps", () => {
  test("each markmap figure with an svg is drawn once from its outline, and torn down on leaving", async () => {
    const outline = { content: "Root", children: [{ content: "Leaf", children: [] }] }
    dom.document.body.innerHTML = `<div class="prose">
      <figure class="markmap" data-markmap='${JSON.stringify(outline)}'><svg></svg></figure>
      <figure class="markmap" data-markmap="{}"></figure></div>`
    await diagrams.renderMarkmaps()
    await diagrams.renderMarkmaps()
    expect(maps).toHaveLength(1)
    expect(maps[0].data).toEqual(outline)
    expect(maps[0].opts).toEqual({ autoFit: true, duration: 300, fitRatio: 0.92 })
    expect(maps[0].svg).toBe(dom.document.querySelector("svg")! as unknown as SVGSVGElement)
    const [drawn, empty] = dom.document.querySelectorAll("figure")
    expect(drawn.hasAttribute("data-drawn")).toBe(true)
    expect(empty.hasAttribute("data-drawn")).toBe(false)
    diagrams.teardownMarkmaps()
    expect(maps[0].destroyed).toBe(true)
    maps[0].destroyed = false
    diagrams.teardownMarkmaps()
    expect(maps[0].destroyed).toBe(false)
  })

  test("a page without any loads nothing", async () => {
    maps.length = 0
    dom.document.body.innerHTML = ""
    await diagrams.renderMarkmaps(dom.document)
    expect(maps).toEqual([])
  })
})
