import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"
import { relativeTended, setupGardenBed } from "../src/scripts/garden-bed"

describe("the garden bed in the browser", () => {
  let dom: Dom
  beforeAll(() => (dom = installDom("https://garden.example/en-US/")))
  afterAll(() => dom.restore())

  const bed = (cap: string, extra = "") => `<section data-garden data-cap="${cap}">
    <div data-garden-filters hidden>
      <button data-garden-chip data-kind="all">All</button>
      <button data-garden-chip data-kind="stage" data-value="tree">Trees</button>
      <button data-garden-chip data-kind="folder" data-value="Notes">Notes</button>
      <select data-garden-tag><option value="">Any</option><option value="pkm">pkm</option></select>
    </div>
    <div class="garden-tile" id="t1" data-stage="tree" data-folder="Notes" data-tags="pkm garden"></div>
    <div class="garden-tile" id="t2" data-stage="seed" data-folder="Notes" data-tags="pkm"></div>
    <div class="garden-tile" id="t3" data-stage="tree" data-folder="Books"></div>
    <div class="garden-tile" id="t4"></div>
    ${extra}
  </section>`
  const shown = () => [...document.querySelectorAll<HTMLElement>(".garden-tile")].filter((t) => !t.hidden).map((t) => t.id)
  const chip = (kind: string) => document.querySelector<HTMLButtonElement>(`[data-garden-chip][data-kind="${kind}"]`)!

  test("the home page shows the first tiles only, until the reader asks for more", () => {
    document.body.innerHTML = bed("2", `<button data-garden-more hidden>More</button>`)
    setupGardenBed()
    const more = document.querySelector<HTMLButtonElement>("[data-garden-more]")!
    expect(document.querySelector<HTMLElement>("[data-garden-filters]")!.hidden).toBe(false)
    expect(shown()).toEqual(["t1", "t2"])
    expect(more.hidden).toBe(false)
    more.click()
    expect(shown()).toEqual(["t1", "t2", "t3", "t4"])
    expect(more.hidden).toBe(true)
  })

  test("chips filter by stage or folder, one at a time, and a filter lifts the cap", () => {
    document.body.innerHTML = bed("1", `<button data-garden-more>More</button>`)
    setupGardenBed()
    expect(shown()).toEqual(["t1"])
    chip("stage").click()
    expect(shown()).toEqual(["t1", "t3"])
    expect(chip("stage").getAttribute("aria-pressed")).toBe("true")
    expect(chip("folder").getAttribute("aria-pressed")).toBe("false")
    chip("folder").click()
    expect(shown()).toEqual(["t1", "t2"])
    chip("all").click()
    expect(shown()).toEqual(["t1"])
  })

  test("the tag select narrows the tiles, and clearing it brings them back", () => {
    document.body.innerHTML = bed("0")
    setupGardenBed()
    expect(shown()).toEqual(["t1", "t2", "t3", "t4"])
    const select = document.querySelector<HTMLSelectElement>("[data-garden-tag]")!
    select.value = "pkm"
    select.dispatchEvent(new dom.window.Event("change") as unknown as Event)
    expect(shown()).toEqual(["t1", "t2"])
    select.value = ""
    select.dispatchEvent(new dom.window.Event("change") as unknown as Event)
    expect(shown()).toEqual(["t1", "t2", "t3", "t4"])
  })

  test("a bed is bound once; a bare bed without controls still renders", () => {
    document.body.innerHTML = `<section data-garden><div class="garden-tile" id="x" hidden></div></section>`
    setupGardenBed()
    setupGardenBed()
    expect(shown()).toEqual(["x"])
  })

  test("recent tended dates read as relative time in the page's language, older ones stay", () => {
    const recent = new Date(Date.now() - 3 * 86_400_000).toISOString()
    document.documentElement.lang = "en-US"
    document.body.innerHTML = `<time id="a" data-tended datetime="${recent}">then</time><time id="b" data-tended datetime="2001-01-01">1 Jan 2001</time>`
    setupGardenBed()
    expect(document.getElementById("a")!.textContent).toBe("3 days ago")
    expect(document.getElementById("b")!.textContent).toBe("1 Jan 2001")
    document.documentElement.lang = ""
    document.getElementById("a")!.textContent = "then"
    setupGardenBed()
    expect(document.getElementById("a")!.textContent).toBe("3 days ago")
  })

  test("a language Intl cannot format leaves the date as it was", () => {
    const spy = spyOn(Intl, "RelativeTimeFormat").mockImplementation((() => {
      throw new RangeError("bad language")
    }) as never)
    try {
      expect(relativeTended(new Date(Date.now() - 1000), "xx")).toBeUndefined()
    } finally {
      spy.mockRestore()
    }
  })
})
