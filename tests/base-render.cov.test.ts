import { describe, expect, spyOn, test } from "bun:test"
import { baseViews, renderBaseBlock, renderBaseView } from "../src/lib/base-render"
import type { Doc } from "../src/lib/vault"

// Bases rendered over the fixture vault, as a .base file's page or a ```base block shows them.
let n = 0
const doc = (src: string): Doc => ({ rel: `cov/Test${++n}.base`, kind: "base", name: `Test${n}`, dir: "cov", src, texts: {} as Doc["texts"] })
const PROJECT = "filters: 'file.inFolder(\"07_Project\")'\n"

describe("baseViews", () => {
  test("names the views in file order", () => {
    expect(baseViews(doc("views: [{ type: table, name: One }, { type: cards, name: Two }]"))).toEqual(["One", "Two"])
  })

  test("a malformed base has no views rather than failing the page", () => {
    expect(baseViews(doc("views: ["))).toEqual([])
    expect(baseViews(doc("views: 3"))).toEqual([])
  })
})

describe("renderBaseView", () => {
  test("the named view, else the first; `this` is the note at currentKey", () => {
    const d = doc(`${PROJECT}views:\n  - { type: list, name: Names, order: [file.name] }\n  - { type: table, name: Here, order: [file.name, this.file.name] }`)
    const list = renderBaseView(d, undefined, "en-US")
    expect(list).toStartWith('<ul class="dataview dv-list">')
    expect(list).toContain(">Blog post</a>")
    expect(renderBaseView(d, "Nope", "en-US")).toBe(list)
    const table = renderBaseView(d, "Here", "en-US", "07_Project/Talk")
    expect(table).toStartWith('<table class="dataview base-table"><thead><tr><th>Name</th><th>this.file.name</th></tr></thead>')
    expect(table.match(/<td>Talk<\/td>/g)!.length).toBe(4)
  })

  test("errors in the base show in its name, on the page", () => {
    const out = renderBaseView(doc("views: ["), undefined, "en-US")
    expect(out).toStartWith(`<p class="dataview dv-error">Test${n}: invalid YAML`)
    expect(renderBaseView(doc("views: [{ filters: 'nope()' }]"), undefined, "en-US")).toContain("unknown function nope()")
  })

  test("a view with no rows says so", () => {
    expect(renderBaseView(doc("views: [{ filters: 'false' }]"), undefined, "en-US")).toStartWith('<p class="dataview dv-empty">')
  })

  test("cards: an http image from the view, else the note's banner, else none; fields but the name", () => {
    const d = doc(
      `${PROJECT}formulas:\n  img: 'if(file.name == "Talk", "https://img.example/talk.png", "")'\nviews:\n  - { type: cards, image: formula.img, order: [file.name, file.folder] }\n  - { type: cards, order: [file.name] }`,
    )
    const cards = renderBaseView(d, "View 1", "en-US")
    expect(cards).toStartWith('<div class="card-wall base-cards">')
    expect(cards).toContain('<img src="https://img.example/talk.png"')
    expect(cards).toContain('<img src="/assets/_assets/images/diagram.png"')
    expect(cards).toContain('<ul class="base-fields"><li><b>folder</b> 07_Project</li></ul>')
    expect(cards).not.toContain("<b>Name</b>")
    // Notes without image or banner have no media; a view of names only has no field list.
    const plain = renderBaseView(d, "View 2", "en-US")
    expect(plain).not.toContain("base-fields")
    expect(plain).toMatch(/<article class="index-card base-card"><h3 class="index-card-title"><a class="internal" href="[^"]+" data-key="07_Project\/Talk">Talk<\/a><\/h3><\/article>/)
  })

  test("a map on the base's own page fills the screen", () => {
    const out = renderBaseView(doc("views: [{ type: map }]"), undefined, "en-US", undefined, false)
    expect(out).toContain('class="leaflet-block base-map is-page"')
  })
})

describe("renderBaseBlock", () => {
  test("every view, named when there are several, through each view type", () => {
    const src = `${PROJECT}views:\n  - { type: map, name: Where }\n  - { type: bases, name: T }\n  - { type: notion-list, name: L }\n  - { type: notion-board, name: B }\n  - { type: notion-feed, name: F }`
    const out = renderBaseBlock(src, "en-US", "07_Project/Talk")
    expect(out).toStartWith('<div class="base-embed base-block"><p class="base-view-name">Where</p><figure class="leaflet-block base-map"')
    for (const cls of ["ntn-table-wrap", "ntn-list-wrap", "ntn-board", "ntn-feed"]) expect(out).toContain(cls)
    expect(out.match(/base-view-name/g)!.length).toBe(5)
  })

  test("a single view is not named", () => {
    expect(renderBaseBlock(`${PROJECT}views: [{ type: list }]`, "en-US", "x")).not.toContain("base-view-name")
  })

  test("errors show as the base's, other failures are not swallowed", () => {
    expect(renderBaseBlock("views: [", "en-US", "x")).toStartWith('<p class="dataview dv-error">base: invalid YAML')
    // A failure that is not a base error, here a RangeError out of toFixed in round(), propagates.
    const toFixed = spyOn(Number.prototype, "toFixed").mockImplementation(() => {
      throw new RangeError("toFixed() digits argument must be between 0 and 100")
    })
    try {
      expect(() => renderBaseBlock("formulas: { bad: '(1).round(2)' }\nviews: [{ order: [formula.bad] }]", "en-US", "x")).toThrow(RangeError)
    } finally {
      toFixed.mockRestore()
    }
  })
})
