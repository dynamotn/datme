import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"

type Paged = typeof import("../src/scripts/paged")
let dom: Dom
let paged: Paged
beforeAll(async () => {
  dom = installDom("https://garden.example/note")
  paged = await import("../src/scripts/paged")
})
afterAll(() => dom.restore())

/** A note page of the e-ink style, its article 600px wide in columns 48px apart, `pages` long. */
function page({ pages = 4, look = "eink", on = true, dir = "ltr", bar = true } = {}) {
  const root = dom.document.documentElement
  root.dataset.look = look
  root.classList.toggle("paged", on)
  if (on) dom.window.localStorage.setItem("paged", "1")
  else dom.window.localStorage.removeItem("paged")
  dom.document.body.innerHTML = `<button data-paged-toggle aria-pressed="false">Turn pages</button>
    <article class="note" style="column-gap: 48px; direction: ${dir}">
      <p>Text</p><a href="/x" class="internal">far link</a><input name="q"><span class="far">far</span>
    </article>
    ${bar ? `<nav data-paged-bar hidden><button data-paged-prev>‹</button><span data-paged-count data-template="Trang {n} / {total}"></span><button data-paged-next>›</button></nav>` : ""}
    <dialog></dialog>`
  const note = dom.document.querySelector<HTMLElement>("article.note")!
  Object.defineProperty(note, "clientWidth", { value: 600, configurable: true })
  Object.defineProperty(note, "scrollWidth", { value: pages * 600 + (pages - 1) * 48, configurable: true })
  note.getBoundingClientRect = () => ({ left: 100, right: 700, width: 600, top: 0, bottom: 800, height: 800 }) as DOMRect
  paged.setupPaged()
  const $ = <T extends HTMLElement>(s: string) => dom.document.querySelector<T>(s)!
  return { note, count: $("[data-paged-count]"), prev: $<HTMLButtonElement>("[data-paged-prev]"), next: $<HTMLButtonElement>("[data-paged-next]"), bar: $("[data-paged-bar]"), toggle: $("[data-paged-toggle]") }
}
const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = dom.document.body) => {
  const e = new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}
const tap = (target: Element, x: number) => target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, clientX: x }))

describe("paged reading: the sums", () => {
  test("pageCount and pageAt read columns and their gaps; a box without width is one page", () => {
    expect(paged.pageCount(4 * 600 + 3 * 48, 600, 48)).toBe(4)
    expect(paged.pageCount(500, 600, 48)).toBe(1)
    expect(paged.pageCount(5000, 0, 48)).toBe(1)
    expect(paged.pageAt(0, 600, 48)).toBe(0)
    expect(paged.pageAt(648 + 10, 600, 48)).toBe(1)
    expect(paged.pageAt(648 * 2 - 10, 600, 48)).toBe(2)
    expect(paged.pageAt(900, 0, 48)).toBe(0)
  })

  test("keyTurn: page keys and arrows, swapped right to left, none with a modifier", () => {
    const k = (key: string, mods: Partial<KeyboardEvent> = {}) => ({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods })
    expect(paged.keyTurn(k("PageDown"))).toBe(1)
    expect(paged.keyTurn(k("PageUp"))).toBe(-1)
    expect(paged.keyTurn(k("ArrowRight"))).toBe(1)
    expect(paged.keyTurn(k("ArrowLeft"))).toBe(-1)
    expect(paged.keyTurn(k("ArrowRight"), true)).toBe(-1)
    expect(paged.keyTurn(k("ArrowLeft"), true)).toBe(1)
    expect(paged.keyTurn(k("a"))).toBe(0)
    for (const mod of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) expect(paged.keyTurn(k("PageDown", { [mod]: true }))).toBe(0)
  })

  test("tapTurn: the outer fifth of either side turns, the middle does not", () => {
    expect(paged.tapTurn(110, 100, 600)).toBe(-1)
    expect(paged.tapTurn(690, 100, 600)).toBe(1)
    expect(paged.tapTurn(400, 100, 600)).toBe(0)
    expect(paged.tapTurn(110, 100, 600, true)).toBe(1)
    expect(paged.tapTurn(690, 100, 600, true)).toBe(-1)
  })
})

describe("paged reading on a page", () => {
  test("a paged e-ink note shows its first page, its count and its buttons", () => {
    const { note, count, prev, next, bar, toggle } = page()
    expect(note.classList.contains("is-paged")).toBe(true)
    expect(bar.hidden).toBe(false)
    expect(count.textContent).toBe("Trang 1 / 4")
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
  })

  test("the page keys and arrows turn it, never past either end", () => {
    const { note, count, next } = page()
    expect(key("PageDown").defaultPrevented).toBe(true)
    expect(note.scrollLeft).toBe(648)
    key("ArrowRight")
    key("ArrowRight")
    key("ArrowRight")
    expect(count.textContent).toBe("Trang 4 / 4")
    expect(next.disabled).toBe(true)
    key("PageUp")
    expect(count.textContent).toBe("Trang 3 / 4")
    // Not a page key, a key with a modifier, typing in a field or an open dialog: nothing turns.
    expect(key("a").defaultPrevented).toBe(false)
    key("PageUp", { ctrlKey: true })
    key("PageUp", {}, dom.document.querySelector("input")!)
    const dialog = dom.document.querySelector("dialog")!
    dialog.setAttribute("open", "")
    key("PageUp")
    dialog.removeAttribute("open")
    expect(count.textContent).toBe("Trang 3 / 4")
  })

  test("the buttons and a tap on either edge turn it; a tap in the middle, on a link or over a selection does not", () => {
    const { note, count, prev, next } = page()
    next.click()
    next.click()
    expect(count.textContent).toBe("Trang 3 / 4")
    prev.click()
    expect(count.textContent).toBe("Trang 2 / 4")
    const text = note.querySelector("p")!
    tap(text, 690)
    expect(count.textContent).toBe("Trang 3 / 4")
    tap(text, 110)
    tap(text, 400)
    expect(count.textContent).toBe("Trang 2 / 4")
    tap(note.querySelector("a")!, 690)
    tap(dom.document.body, 690)
    const range = dom.document.createRange()
    range.selectNodeContents(text)
    dom.window.getSelection()!.addRange(range)
    tap(text, 690)
    dom.window.getSelection()!.removeAllRanges()
    expect(count.textContent).toBe("Trang 2 / 4")
  })

  test("right to left, the columns run leftwards and the edges swap", () => {
    const { note, count } = page({ dir: "rtl" })
    key("ArrowLeft")
    expect(count.textContent).toBe("Trang 2 / 4")
    expect(note.scrollLeft).toBe(-648)
    tap(note.querySelector("p")!, 110)
    expect(count.textContent).toBe("Trang 3 / 4")
  })

  test("a link reached with Tab turns to its page", () => {
    const { note, count } = page()
    const link = note.querySelector<HTMLElement>("a")!
    link.getBoundingClientRect = () => ({ left: 100 + 2 * 648 + 20, right: 100 + 2 * 648 + 80 }) as DOMRect
    link.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }))
    expect(count.textContent).toBe("Trang 3 / 4")
    // The note itself, and anything outside it, leave the page alone.
    note.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }))
    dom.document.body.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }))
    expect(count.textContent).toBe("Trang 3 / 4")
    const { note: rtl, count: rtlCount } = page({ dir: "rtl" })
    const far = rtl.querySelector<HTMLElement>(".far")!
    far.getBoundingClientRect = () => ({ left: 700 - 648 - 80, right: 700 - 648 - 20 }) as DOMRect
    far.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }))
    expect(rtlCount.textContent).toBe("Trang 2 / 4")
  })

  test("the View menu's toggle turns paging on and off, and keeps the choice", () => {
    const { note, bar, toggle } = page({ on: false })
    expect(note.classList.contains("is-paged")).toBe(false)
    expect(bar.hidden).toBe(true)
    expect(paged.turn(1)).toBe(false)
    toggle.click()
    expect(dom.document.documentElement.classList.contains("paged")).toBe(true)
    expect(dom.window.localStorage.getItem(paged.PAGED_KEY)).toBe("1")
    expect(bar.hidden).toBe(false)
    expect(paged.turn(1)).toBe(true)
    toggle.click()
    expect(dom.window.localStorage.getItem(paged.PAGED_KEY)).toBeNull()
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
    expect(note.classList.contains("is-paged")).toBe(false)
  })

  test("another style picked in the View menu, or a window resized, lays the note out again", async () => {
    const { note, bar, count } = page()
    dom.document.documentElement.dataset.look = "classic"
    await settle()
    expect(note.classList.contains("is-paged")).toBe(false)
    expect(bar.hidden).toBe(true)
    key("PageDown")
    dom.document.documentElement.dataset.look = "eink"
    await settle()
    Object.defineProperty(note, "scrollWidth", { value: 2 * 600 + 48, configurable: true })
    dom.window.dispatchEvent(new dom.window.Event("resize"))
    expect(count.textContent).toBe("Trang 1 / 2")
  })

  test("a page without the page bar is never paged, and the count falls back to its own words", () => {
    const { note } = page({ bar: false })
    expect(note.classList.contains("is-paged")).toBe(false)
    const { count } = page()
    delete count.dataset.template
    paged.turn(1)
    expect(count.textContent).toBe("2 / 4")
  })

  test("with storage blocked the page scrolls, and a choice lasts for the page", () => {
    const blocked = {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
      removeItem() {
        throw new Error("blocked")
      },
    }
    const { toggle } = page({ on: false })
    dom.set("localStorage", blocked)
    paged.setupPaged()
    expect(dom.document.documentElement.classList.contains("paged")).toBe(false)
    toggle.click()
    expect(dom.document.documentElement.classList.contains("paged")).toBe(true)
    toggle.click()
    dom.set("localStorage", dom.window.localStorage)
  })
})
