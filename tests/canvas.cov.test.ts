import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"
import { setupCanvas } from "../src/scripts/canvas"

describe("pan and zoom of a canvas page", () => {
  let dom: Dom
  let viewport: HTMLElement
  let board: HTMLElement
  let captured: number[]
  beforeAll(() => (dom = installDom("https://garden.example/en-US/board")))
  afterAll(() => dom.restore())

  const size = (el: HTMLElement, props: Record<string, number>) => {
    for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { configurable: true, value: v })
  }
  const pointer = (type: string, x: number, y: number, target: Element = viewport) => {
    const e = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
    Object.defineProperty(e, "pointerId", { value: 7 })
    target.dispatchEvent(e as unknown as Event)
    return e
  }
  const wheel = (deltaY: number, x: number, y: number) => {
    const e = new dom.window.Event("wheel", { bubbles: true, cancelable: true })
    Object.assign(e, { deltaY, clientX: x, clientY: y })
    viewport.dispatchEvent(e as unknown as Event)
    return e
  }
  const transform = () => board.style.transform

  beforeEach(() => {
    document.body.innerHTML = `<div data-canvas>
      <div class="canvas-board"><a href="/en-US/note">card</a></div>
      <div class="canvas-controls"><button data-canvas-zoom="in">+</button><button data-canvas-zoom="out">-</button><button data-canvas-zoom="fit">fit</button></div>
    </div>`
    viewport = document.querySelector<HTMLElement>("[data-canvas]")!
    board = viewport.querySelector<HTMLElement>(".canvas-board")!
    size(viewport, { clientWidth: 400, clientHeight: 200 })
    size(board, { offsetWidth: 800, offsetHeight: 200 })
    viewport.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect
    captured = []
    viewport.setPointerCapture = (id: number) => void captured.push(id)
  })

  test("a page without a canvas, or a canvas without a board, is left alone", () => {
    document.body.innerHTML = `<div data-canvas></div>`
    expect(() => setupCanvas()).not.toThrow()
    document.body.innerHTML = ``
    expect(() => setupCanvas()).not.toThrow()
  })

  test("the board is fitted into view on load, never enlarged", () => {
    setupCanvas()
    expect(transform()).toBe("translate(0px, 50px) scale(0.5)")
    size(board, { offsetWidth: 100, offsetHeight: 50 })
    document.querySelector<HTMLButtonElement>('[data-canvas-zoom="fit"]')!.click()
    expect(transform()).toBe("translate(150px, 75px) scale(1)")
  })

  test("the buttons zoom around the middle of the view", () => {
    setupCanvas()
    document.querySelector<HTMLButtonElement>('[data-canvas-zoom="in"]')!.click()
    expect(transform()).toBe("translate(-50px, 37.5px) scale(0.625)")
    document.querySelector<HTMLButtonElement>('[data-canvas-zoom="out"]')!.click()
    expect(transform()).toBe("translate(0px, 50px) scale(0.5)")
  })

  test("the wheel zooms around the pointer, within limits", () => {
    setupCanvas()
    const e = wheel(-100000, 10, 20)
    expect(e.defaultPrevented).toBe(true)
    expect(transform()).toMatch(/scale\(3\)$/)
    wheel(100000, 10, 20)
    expect(transform()).toMatch(/scale\(0\.1\)$/)
  })

  test("a drag moves the board once past a few pixels, and does not follow the link it started on", () => {
    setupCanvas()
    // Moving without pressing does nothing.
    pointer("pointermove", 50, 50)
    expect(transform()).toBe("translate(0px, 50px) scale(0.5)")
    const link = board.querySelector("a")!
    pointer("pointerdown", 100, 100, link)
    pointer("pointermove", 101, 101)
    expect(transform()).toBe("translate(0px, 50px) scale(0.5)")
    expect(captured).toEqual([])
    pointer("pointermove", 120, 90)
    expect(captured).toEqual([7])
    expect(transform()).toBe("translate(20px, 40px) scale(0.5)")
    pointer("pointermove", 130, 95)
    expect(captured).toEqual([7])
    expect(transform()).toBe("translate(30px, 45px) scale(0.5)")
    const click = pointer("click", 130, 95, link)
    expect(click.defaultPrevented).toBe(true)
    pointer("pointerup", 130, 95)
    expect(pointer("click", 130, 95, link).defaultPrevented).toBe(false)
  })

  test("pressing on the controls starts no drag", () => {
    setupCanvas()
    pointer("pointerdown", 100, 100, document.querySelector('[data-canvas-zoom="in"]')!)
    pointer("pointermove", 200, 200)
    expect(transform()).toBe("translate(0px, 50px) scale(0.5)")
  })
})
