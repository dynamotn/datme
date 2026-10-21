import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"

type Syllabus = typeof import("../src/scripts/syllabus")

describe("a syllabus's ticks", () => {
  let dom: Dom
  let syllabus: Syllabus
  beforeAll(async () => {
    dom = installDom("https://garden.example/Course/")
    syllabus = await import("../src/scripts/syllabus")
  })
  afterAll(() => dom.restore())

  const page = (progress = true) => {
    dom.document.body.innerHTML =
      (progress
        ? `<div data-syllabus-progress data-template="{done} of {total} done" hidden><progress max="3" value="0"></progress><span></span></div>`
        : "") +
      `<ol class="syllabus">` +
      ["a", "b", "c"].map((id) => `<li data-lesson="${id}"><input type="checkbox" data-lesson-done></li>`).join("") +
      `</ol>`
  }
  const box = (id: string) => dom.document.querySelector<HTMLInputElement>(`[data-lesson="${id}"] input`)!
  const tick = (id: string, on: boolean) => {
    box(id).checked = on
    box(id).dispatchEvent(new Event("change"))
  }

  test("nothing happens without a syllabus", () => {
    dom.document.body.innerHTML = "<p>Plain</p>"
    expect(() => syllabus.setupSyllabus()).not.toThrow()
  })

  test("ticks are kept per course, whatever the trailing slash, and show the progress", () => {
    page()
    syllabus.setupSyllabus()
    const bar = dom.document.querySelector<HTMLElement>("[data-syllabus-progress]")!
    expect(bar.hidden).toBe(false)
    expect(bar.querySelector("span")!.textContent).toBe("0 of 3 done")
    tick("b", true)
    tick("a", true)
    expect(bar.querySelector("progress")!.value).toBe(2)
    expect(bar.querySelector("span")!.textContent).toBe("2 of 3 done")
    expect(dom.document.querySelector('[data-lesson="a"]')!.classList.contains("is-done")).toBe(true)
    // Stored in the order of the course.
    expect(syllabus.loadDone("/Course")).toEqual(["a", "b"])
    page()
    syllabus.setupSyllabus()
    expect([box("a").checked, box("b").checked, box("c").checked]).toEqual([true, true, false])
    tick("a", false)
    tick("b", false)
    expect(dom.window.localStorage.length).toBe(0)
  })

  test("without a progress bar the boxes still work", () => {
    page(false)
    syllabus.setupSyllabus()
    tick("c", true)
    expect(syllabus.loadDone("/Course/")).toEqual(["c"])
    const bar = `<div data-syllabus-progress hidden><progress max="3"></progress><span></span></div>`
    dom.document.body.insertAdjacentHTML("afterbegin", bar)
    syllabus.setupSyllabus()
    expect(dom.document.querySelector("[data-syllabus-progress] span")!.textContent).toBe("1 / 3")
  })

  test("unreadable or blocked storage starts afresh", () => {
    dom.window.localStorage.setItem("datme:syllabus:/Course", "{not json")
    expect(syllabus.loadDone("/Course")).toEqual([])
    dom.window.localStorage.setItem("datme:syllabus:/Course", JSON.stringify({ a: 1 }))
    expect(syllabus.loadDone("/Course")).toEqual([])
    dom.window.localStorage.setItem("datme:syllabus:/Course", JSON.stringify(["a", 2]))
    expect(syllabus.loadDone("/Course")).toEqual(["a"])
    const real = dom.window.localStorage
    dom.set("localStorage", {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
    })
    expect(syllabus.loadDone("/Course")).toEqual([])
    expect(() => syllabus.saveDone("/Course", ["a"])).not.toThrow()
    dom.set("localStorage", real)
  })
})
