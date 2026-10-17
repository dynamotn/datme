import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, sharedOrFresh, type Dom } from "./cov-dom"

let dom: Dom
let revealHash: typeof import("../src/scripts/tabs").revealHash
beforeAll(async () => {
  dom = installDom("https://garden.example/note")
  // The module listens on the document it was imported with.
  ;({ revealHash } = await sharedOrFresh<typeof import("../src/scripts/tabs")>("../src/scripts/tabs", () => {
    dom.document.body.innerHTML = `<div data-tabs><div role="tablist"><button role="tab" id="a">a</button><button role="tab" id="b">b</button></div></div>`
    dom.document.getElementById("b")!.click()
    const answered = dom.document.getElementById("b")!.getAttribute("aria-selected") === "true"
    dom.document.body.innerHTML = ""
    return answered
  }))
})
afterAll(() => dom.restore())

const page = () => {
  dom.document.body.innerHTML = `<div data-tabs>
    <div role="tablist">
      <button role="tab" id="t1" aria-controls="p1" aria-selected="true">One</button>
      <button role="tab" id="t2" aria-controls="p2" aria-selected="false">Two</button>
      <button role="tab" id="t3" aria-controls="p3" aria-selected="false">Three</button>
    </div>
    <div class="tab-panel" id="p1" aria-labelledby="t1">first</div>
    <div class="tab-panel" id="p2" aria-labelledby="t2" hidden>second
      <div data-tabs>
        <div role="tablist"><button role="tab" id="u1" aria-controls="q1">A</button><button role="tab" id="u2" aria-controls="q2">B</button></div>
        <div class="tab-panel" id="q1" aria-labelledby="u1">a</div>
        <div class="tab-panel" id="q2" aria-labelledby="u2" hidden><span id="deep">deep</span></div>
      </div>
    </div>
    <div class="tab-panel" id="p3" aria-labelledby="t3" hidden>third</div>
  </div>
  <div role="tablist"><button role="tab" id="loose" aria-controls="p1">Loose</button></div>`
}
const $ = (id: string) => dom.document.getElementById(id) as HTMLElement
const selected = () => ["t1", "t2", "t3"].filter((id) => $(id).getAttribute("aria-selected") === "true")
const key = (target: HTMLElement, k: string) => {
  const e = new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })
  target.dispatchEvent(e)
  return e
}

describe("tabs", () => {
  test("a click on a tab shows its panel and hides the others", () => {
    page()
    $("t2").click()
    expect(selected()).toEqual(["t2"])
    expect($("p1").hidden).toBe(true)
    expect($("p2").hidden).toBe(false)
    expect($("t2").tabIndex).toBe(0)
    expect($("t1").tabIndex).toBe(-1)
  })

  test("a click elsewhere, or on a tab outside a tabs block, changes nothing", () => {
    page()
    dom.document.body.click()
    $("loose").click()
    expect(selected()).toEqual(["t1"])
    expect($("p1").hidden).toBe(false)
  })

  test("arrow keys, Home and End move between tabs and wrap around", () => {
    page()
    expect(key($("t1"), "ArrowLeft").defaultPrevented).toBe(true)
    expect(selected()).toEqual(["t3"])
    expect(dom.document.activeElement).toBe($("t3"))
    key($("t3"), "ArrowRight")
    expect(selected()).toEqual(["t1"])
    key($("t1"), "End")
    expect(selected()).toEqual(["t3"])
    key($("t3"), "Home")
    expect(selected()).toEqual(["t1"])
  })

  test("other keys, and keys outside tabs, are left alone", () => {
    page()
    expect(key($("t1"), "a").defaultPrevented).toBe(false)
    expect(key(dom.document.body, "ArrowRight").defaultPrevented).toBe(false)
    expect(selected()).toEqual(["t1"])
  })

  test("a tab outside any tab list is not switched", () => {
    page()
    dom.document.body.insertAdjacentHTML("beforeend", `<div data-tabs><button role="tab" id="stray" aria-selected="false">Stray</button></div>`)
    $("stray").click()
    expect($("stray").getAttribute("aria-selected")).toBe("false")
  })
})

describe("revealHash", () => {
  test("a link into nested hidden tabs opens every tab around the target and scrolls to it", () => {
    page()
    let scrolled = false
    $("deep").scrollIntoView = () => void (scrolled = true)
    dom.window.location.hash = "#deep"
    revealHash()
    expect($("p2").hidden).toBe(false)
    expect($("q2").hidden).toBe(false)
    expect($("q1").hidden).toBe(true)
    expect(scrolled).toBe(true)
  })

  test("a panel without its tab is skipped, the target still scrolled to", () => {
    page()
    $("t3").remove()
    $("p3").innerHTML = `<i id="orphan">x</i>`
    let scrolled = false
    $("orphan").scrollIntoView = () => void (scrolled = true)
    dom.window.location.hash = "#orphan"
    revealHash()
    expect(scrolled).toBe(true)
    expect($("p3").hidden).toBe(true)
  })

  test("no hash, an unknown id or a malformed hash do nothing", () => {
    page()
    for (const hash of ["", "#nothing-here", "#%E0%A4%A"]) {
      dom.window.location.hash = hash
      expect(() => revealHash()).not.toThrow()
    }
    expect(selected()).toEqual(["t1"])
  })
})
