import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./cov-dom"

type Progress = typeof import("../src/scripts/progress")
let dom: Dom
let progress: Progress
const frames: (() => void)[] = []
beforeAll(async () => {
  dom = installDom("https://garden.example/note", {
    requestAnimationFrame: (f: () => void) => frames.push(f),
  })
  Object.defineProperty(dom.window, "innerHeight", { value: 1000, configurable: true })
  progress = await import("../src/scripts/progress")
})
afterAll(() => dom.restore())

const page = (words = 2200, left?: string) => {
  dom.document.body.innerHTML = `<div data-progress data-words="${words}" ${left ? `data-left="${left}"` : ""}>
    <div class="reading-progress-fill"></div><span class="reading-progress-left"></span></div>
    <article class="note"></article>`
  const article = dom.document.querySelector<HTMLElement>("article.note")!
  Object.defineProperty(article, "offsetHeight", { value: 3000, configurable: true })
  article.getBoundingClientRect = () => ({ top: 500 - dom.window.scrollY }) as DOMRect
  return {
    fill: dom.document.querySelector<HTMLElement>(".reading-progress-fill")!,
    label: dom.document.querySelector<HTMLElement>(".reading-progress-left")!,
  }
}
const scrollTo = (y: number) => {
  Object.defineProperty(dom.window, "scrollY", { value: y, configurable: true, writable: true })
  dom.window.dispatchEvent(new dom.window.Event("scroll"))
}

describe("reading progress", () => {
  test("progressOf: within a long element, before it, after it, and for one shorter than the screen", () => {
    expect(progress.progressOf(1500, 500, 3000, 1000)).toBe(0.5)
    expect(progress.progressOf(0, 500, 3000, 1000)).toBe(0)
    expect(progress.progressOf(9000, 500, 3000, 1000)).toBe(1)
    expect(progress.progressOf(0, 0, 500, 1000)).toBe(1)
    expect(progress.progressOf(0, 800, 500, 1000)).toBe(0)
  })

  test("minutesLeft rounds up the minutes of the words still to read", () => {
    expect(progress.minutesLeft(2200, 0)).toBe(10)
    expect(progress.minutesLeft(2200, 0.5)).toBe(5)
    expect(progress.minutesLeft(2200, 1)).toBe(0)
  })

  test("the bar fills as the reader scrolls, once per frame, with the minutes left", () => {
    const { fill, label } = page(2200, "còn {n} phút")
    progress.setupProgress()
    expect(fill.style.transform).toBe("scaleX(0)")
    expect(label.hidden).toBe(true)
    scrollTo(1500)
    scrollTo(1500)
    expect(frames).toHaveLength(1)
    frames.shift()!()
    expect(fill.style.transform).toBe("scaleX(0.5)")
    expect(label.textContent).toBe("còn 5 phút")
    expect(label.hidden).toBe(false)
    scrollTo(5000)
    frames.shift()!()
    expect(label.hidden).toBe(true)
  })

  test("setting up again drops the old listener; a page without a bar has none", () => {
    page()
    progress.setupProgress()
    const { label } = page()
    progress.setupProgress()
    scrollTo(1500)
    frames.shift()!()
    expect(label.textContent).toBe("5 min left")
    expect(frames).toHaveLength(0)
    dom.document.body.innerHTML = ""
    progress.setupProgress()
    scrollTo(100)
    expect(frames).toHaveLength(0)
  })
})
