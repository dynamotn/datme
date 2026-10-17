import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"

type Share = typeof import("../src/scripts/share")
let dom: Dom
let share: Share
const copied: string[] = []
let clipboard: { writeText(s: string): Promise<void> } | undefined
beforeAll(async () => {
  dom = installDom("https://garden.example/notes/a?x=1")
  Object.defineProperty(dom.window.navigator, "clipboard", { get: () => clipboard, configurable: true })
  share = await import("../src/scripts/share")
  // The module listens on the document of its first setup: the shared page.
  clipboard = okClipboard
  share.setupShare()
  share.setupShare()
  page()
  select(dom.document.getElementById("p")!.firstChild!)
  await mouseup()
  expect(bar()).not.toBeNull()
  dom.document.dispatchEvent(new dom.window.Event("scroll"))
  dom.document.getSelection()!.removeAllRanges()
})
afterAll(() => dom.restore())

const okClipboard = { writeText: async (s: string) => void copied.push(s) }
const page = (body = `<article class="note"><div class="prose"><p id="p">The slip box is a second brain for notes.</p></div></article>`) => {
  dom.document.body.innerHTML = body
  dom.document.body.dataset.sharePassage = "Chép liên kết"
  dom.document.body.dataset.copied = "Đã chép"
  dom.document.body.dataset.highlight = "Tô sáng"
}
const select = (node: Node) => {
  const sel = dom.document.getSelection()!
  sel.removeAllRanges()
  const range = dom.document.createRange()
  range.selectNodeContents(node)
  sel.addRange(range)
}
const mouseup = async (target: EventTarget = dom.document.body) => {
  target.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }))
  await settle(5)
}
const bar = () => dom.document.querySelector<HTMLElement>(".share-bar")
const buttons = () => [...(bar()?.querySelectorAll("button") ?? [])].map((b) => b.textContent)

describe("textFragment", () => {
  test("a short passage is quoted whole, a long one by its first and last words, with the reserved characters escaped", () => {
    expect(share.textFragment("  a-b,  c&d  ")).toBe("#:~:text=a%2Db%2C%20c%26d")
    expect(share.textFragment("   ")).toBe("")
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ")
    expect(share.textFragment(words)).toBe("#:~:text=w0%20w1%20w2%20w3%20w4,w15%20w16%20w17%20w18%20w19")
  })
})

describe("sharing a selection", () => {
  test("a selection in a note offers a link to it and a highlight, placed over it", async () => {
    clipboard = okClipboard
    page()
    select(dom.document.getElementById("p")!.firstChild!)
    await mouseup()
    expect(buttons()).toEqual(["Chép liên kết", "Tô sáng"])
    expect(bar()!.style.left).toMatch(/px$/)
    expect(bar()!.style.top).toBe("8px")
  })

  test("copying puts the link to the passage on the clipboard, then the bar goes", async () => {
    copied.length = 0
    const b = bar()!.querySelector<HTMLButtonElement>("button")!
    b.click()
    await settle(5)
    expect(copied).toEqual(["https://garden.example/notes/a#:~:text=The%20slip%20box%20is%20a%20second%20brain%20for%20notes."])
    expect(b.textContent).toBe("Đã chép")
    await settle(1300)
    expect(!!bar()).toBe(false)
  })

  test("without clipboard access the link goes to the address bar instead; default labels stand in", async () => {
    clipboard = {
      writeText: () => Promise.reject(new Error("denied")),
    }
    page()
    delete dom.document.body.dataset.sharePassage
    delete dom.document.body.dataset.highlight
    select(dom.document.getElementById("p")!.firstChild!)
    await mouseup()
    expect(buttons()).toEqual(["Copy link to passage", "Highlight"])
    bar()!.querySelector<HTMLButtonElement>("button")!.click()
    await settle(5)
    expect(dom.window.location.hash).toBe("#:~:text=The%20slip%20box%20is%20a%20second%20brain%20for%20notes.")
    // "Copied" never shows: the copy failed.
    expect(bar()!.querySelector("button")!.textContent).toBe("Copy link to passage")
    dom.window.history.replaceState(null, "", "/notes/a")
    clipboard = okClipboard
  })

  test("a click inside the bar keeps it; the highlight button highlights and hides it", async () => {
    page()
    select(dom.document.getElementById("p")!.firstChild!)
    await mouseup()
    const first = bar()
    await mouseup(first!.querySelector("button")!)
    expect(bar() === first).toBe(true)
    const [, highlight] = bar()!.querySelectorAll("button")
    highlight.click()
    expect(!!bar()).toBe(false)
    expect(dom.window.localStorage.getItem("datme:highlights:/notes/a")).toContain("The slip box is a second brain for notes.")
    expect(dom.document.getSelection()!.rangeCount).toBe(0)
  })

  test("a copy of a note (a stacked column) offers no highlight; without a clipboard there is nothing to offer", async () => {
    page(`<div data-stack-col></div><div data-stack-col><article class="note"><div class="prose"><p id="p">A stacked note with some text.</p></div></article></div>`)
    select(dom.document.getElementById("p")!.firstChild!)
    await mouseup()
    expect(buttons()).toEqual(["Chép liên kết"])
    clipboard = undefined
    await mouseup()
    expect(!!bar()).toBe(false)
    clipboard = okClipboard
  })

  test("text outside a note, too short, or no selection at all shows no bar", async () => {
    page(`<div class="prose"><p id="p">ab</p></div><p id="out">Outside the prose</p><article class="note"><div class="prose"><p id="ok">Long enough</p></div></article>`)
    select(dom.document.getElementById("out")!.firstChild!)
    await mouseup()
    expect(!!bar()).toBe(false)
    select(dom.document.getElementById("p")!.firstChild!)
    await mouseup()
    expect(!!bar()).toBe(false)
    dom.document.getSelection()!.removeAllRanges()
    await mouseup()
    expect(!!bar()).toBe(false)
    // A selection of a whole element, whose container has no parent element.
    const sel = dom.document.getSelection()!
    const range = dom.document.createRange()
    range.selectNodeContents(dom.document)
    sel.addRange(range)
    await mouseup()
    expect(!!bar()).toBe(false)
  })

  test("a selection made with shift and the keyboard shows the bar; scrolling hides it", async () => {
    page()
    select(dom.document.getElementById("p")!.firstChild!)
    dom.document.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "a" }))
    await settle(5)
    expect(!!bar()).toBe(false)
    dom.document.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "Shift" }))
    await settle(5)
    expect(!!bar()).toBe(true)
    dom.document.dispatchEvent(new dom.window.Event("scroll"))
    expect(!!bar()).toBe(false)
    dom.document.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "ArrowRight", shiftKey: true }))
    await settle(5)
    expect(!!bar()).toBe(true)
    // A new selection replaces the bar rather than adding one.
    await mouseup()
    expect(dom.document.querySelectorAll(".share-bar")).toHaveLength(1)
  })
})
