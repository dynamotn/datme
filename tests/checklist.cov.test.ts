import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"

type Checklist = typeof import("../src/scripts/checklist")
type Ticks = typeof import("../src/scripts/ticks")

describe("a checklist's ticks", () => {
  let dom: Dom
  let checklist: Checklist
  let ticks: Ticks
  beforeAll(async () => {
    dom = installDom("https://garden.example/Packing/")
    checklist = await import("../src/scripts/checklist")
    ticks = await import("../src/scripts/ticks")
  })
  afterAll(() => dom.restore())

  const page = (bar = true) => {
    dom.document.body.innerHTML =
      `<div data-checklist>` +
      (bar
        ? `<div data-checklist-progress data-template="{done} of {total} done" hidden><progress max="3" value="0"></progress><span></span><button type="button" data-checklist-reset>Reset</button></div>`
        : "") +
      `<input type="checkbox" data-check="passport">` +
      `<section data-checklist-section><h2>Clothes</h2><p data-checklist-count hidden></p><input type="checkbox" checked data-check="boots"><input type="checkbox" data-check="socks"></section>` +
      `</div>`
  }
  const box = (id: string) => dom.document.querySelector<HTMLInputElement>(`[data-check="${id}"]`)!
  const tick = (id: string, on: boolean) => {
    box(id).checked = on
    box(id).dispatchEvent(new Event("change"))
  }
  const text = (sel: string) => dom.document.querySelector(sel)!.textContent

  test("nothing happens without a checklist", () => {
    dom.document.body.innerHTML = '<ul><li><input type="checkbox" disabled></li></ul>'
    expect(() => checklist.setupChecklist()).not.toThrow()
  })

  test("the note's own ticks first, then the reader's, kept per page; each section counts its own", () => {
    page()
    checklist.setupChecklist()
    expect(dom.document.querySelector<HTMLElement>("[data-checklist-progress]")!.hidden).toBe(false)
    expect(text("[data-checklist-progress] span")).toBe("1 of 3 done")
    expect(text("[data-checklist-count]")).toBe("1/2")
    tick("socks", true)
    expect(text("[data-checklist-count]")).toBe("2/2")
    expect(dom.document.querySelector("[data-checklist-section]")!.classList.contains("is-done")).toBe(true)
    tick("boots", false)
    expect(ticks.loadTicks("checklist", "/Packing")).toEqual(["socks"])
    // The next visit finds the reader's ticks, not the note's.
    page()
    checklist.setupChecklist()
    expect([box("passport").checked, box("boots").checked, box("socks").checked]).toEqual([false, false, true])
    expect(dom.document.querySelector<HTMLProgressElement>("[data-checklist-progress] progress")!.value).toBe(1)
    // Unticking everything is kept too.
    tick("socks", false)
    expect(ticks.loadTicks("checklist", "/Packing/")).toEqual([])
    page()
    checklist.setupChecklist()
    expect(box("boots").checked).toBe(false)
  })

  test("reset goes back to the list as written and forgets the reader's ticks", () => {
    page()
    checklist.setupChecklist()
    tick("passport", true)
    dom.document.querySelector<HTMLButtonElement>("[data-checklist-reset]")!.click()
    expect([box("passport").checked, box("boots").checked]).toEqual([false, true])
    expect(ticks.loadTicks("checklist", "/Packing")).toBeNull()
    expect(text("[data-checklist-progress] span")).toBe("1 of 3 done")
  })

  test("without a progress bar the boxes and counts still work", () => {
    page(false)
    checklist.setupChecklist()
    tick("passport", true)
    expect(ticks.loadTicks("checklist", "/Packing")).toEqual(["passport", "boots"])
    expect(text("[data-checklist-count]")).toBe("1/2")
    ticks.saveTicks("checklist", "/Packing", null)
  })

  test("unreadable or blocked storage keeps nothing", () => {
    dom.window.localStorage.setItem("datme:checklist:/Packing", "{not json")
    expect(ticks.loadTicks("checklist", "/Packing")).toBeNull()
    dom.window.localStorage.setItem("datme:checklist:/Packing", JSON.stringify({ a: 1 }))
    expect(ticks.loadTicks("checklist", "/Packing")).toEqual([])
    dom.window.localStorage.removeItem("datme:checklist:/Packing")
    const real = dom.window.localStorage
    dom.set("localStorage", {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
    })
    expect(ticks.loadTicks("checklist", "/Packing")).toBeNull()
    expect(() => ticks.saveTicks("checklist", "/Packing", ["a"])).not.toThrow()
    dom.set("localStorage", real)
  })
})
