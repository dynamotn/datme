import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"

// Vite turns the ?url import into the stylesheet's address; here it is a fixed one.
mock.module("katex/dist/katex.min.css?url", () => ({ default: "/assets/katex.css" }))

let dom: Dom
let styles: typeof import("../src/scripts/styles")

beforeAll(async () => {
  dom = installDom("https://garden.example/note")
  styles = await import("../src/scripts/styles")
})
afterAll(() => dom.restore())

const katex = () => [...dom.document.querySelectorAll<HTMLLinkElement>('link[href="/assets/katex.css"]')]
const fire = (name: string) => dom.document.dispatchEvent(new dom.window.Event(name))
const reset = (head = "", body = "") => {
  fire("astro:after-swap")
  dom.document.head.innerHTML = head
  dom.document.body.innerHTML = body
}

describe("KaTeX's stylesheet", () => {
  test("is linked before the base stylesheet when the page holds math", () => {
    reset('<link rel="stylesheet" href="/base.css" data-css="2">', '<span class="katex">x</span>')
    fire("astro:page-load")
    expect(katex()).toHaveLength(1)
    expect(katex()[0].dataset.css).toBe("1")
    expect(katex()[0].nextElementSibling?.getAttribute("href")).toBe("/base.css")
    // Linked already: a second load adds nothing.
    fire("astro:page-load")
    expect(katex()).toHaveLength(1)
  })

  test("goes at the end of <head> when no ordered stylesheet follows it", () => {
    reset("<title>x</title>", '<span class="katex">x</span>')
    fire("astro:page-load")
    expect(dom.document.head.lastElementChild).toBe(katex()[0])
  })

  test("is linked once math arrives after the page", async () => {
    reset()
    fire("astro:page-load")
    fire("astro:page-load")
    dom.document.body.append(dom.document.createElement("p"))
    await settle()
    expect(katex()).toHaveLength(0)
    const pop = dom.document.createElement("div")
    pop.innerHTML = '<span class="katex">x</span>'
    dom.document.body.append(pop)
    await settle()
    expect(katex()).toHaveLength(1)
    // The watch stopped with it.
    fire("astro:page-load")
    expect(katex()).toHaveLength(1)
  })

  test("a page without math links nothing, and a swap stops the watch", async () => {
    reset()
    fire("astro:page-load")
    reset()
    const math = dom.document.createElement("span")
    math.className = "katex"
    dom.document.body.append(math)
    await settle()
    expect(katex()).toHaveLength(0)
  })
})

describe("orderStyles", () => {
  test("moves a newcomer back in front of the stylesheets that follow it", () => {
    reset('<link data-css="2" id="base"><link data-css="3" id="look"><link data-css="4" id="print"><link data-css="1" id="katex">')
    fire("astro:after-swap")
    expect([...dom.document.head.children].map((l) => l.id)).toEqual(["katex", "base", "look", "print"])
    styles.orderStyles()
    expect([...dom.document.head.children].map((l) => l.id)).toEqual(["katex", "base", "look", "print"])
  })
})
