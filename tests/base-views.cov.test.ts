import { describe, expect, spyOn, test } from "bun:test"
import { parseBase, runView } from "../src/lib/bases"
import { mapMarkers, renderMapView } from "../src/lib/base-map"
import { parsePinned, renderNotionBoard, renderNotionFeed, renderNotionList, renderNotionTable, textOf } from "../src/lib/base-notion"
import type { Engine, Page } from "../src/lib/dataview"

const page = (key: string, fields: Record<string, unknown> = {}, tags: string[] = []): Page => ({
  key,
  title: key.split("/").pop()!,
  url: "/" + key.toLowerCase(),
  dir: key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "",
  stem: key.split("/").pop()!,
  tags,
  explicitTags: tags,
  fields,
  outlinks: [],
  inlinks: [],
})
const pages = [
  page("Places/Hanoi", { coordinates: [21, 105], lat: 10, lng: 20, n: 1.5, status: "done", topics: ["food", ["nested", "list"]], icon: "Not-Lucide" }),
  page("Places/Hue", { coordinates: [16, 107], status: "blocked", topics: [] }),
]
const engine: Engine = { pages, resolve: (t) => pages.find((p) => p.stem === t) }
const run = (src: string, eng: Engine = engine) => {
  const base = parseBase(src)
  return { base, res: runView(base, base.views[0], eng) }
}
const mapOf = (extra: string, eng: Engine = engine) => {
  const { base, res } = run(`views: [{ type: map, ${extra} }]`, eng)
  return renderMapView(res, base, eng, "en", true)
}

describe("map centre", () => {
  test("a list, or a formula over the note holding the base, else the first note", () => {
    expect(mapOf("center: [1, 2]")).toContain('data-center="1,2" data-zoom="4"')
    expect(mapOf('center: "[note.lat, note.lng]"')).toContain('data-center="10,20"')
    const current = page("Here", { lat: 30, lng: 40 })
    expect(mapOf('center: "[note.lat, note.lng]"', { ...engine, current })).toContain('data-center="30,40"')
  })

  test("a centre that does not parse or evaluate is no centre", () => {
    const noCentre = 'data-min-zoom="0" data-max-zoom="18"></div>'
    expect(mapOf('center: "not ) valid"')).toContain(noCentre)
    expect(mapOf('center: "note.lat"')).toContain(noCentre)
    // With no notes at all there is nothing to evaluate the formula on: the world view.
    const empty: Engine = { pages: [], resolve: () => undefined }
    const { base, res } = run('views: [{ type: map, center: "note.lat" }]', empty)
    expect(renderMapView(res, base, empty, "en", true)).toContain('data-center="0,0" data-zoom="1"')
  })

  test("a centre formula failing for another reason is not swallowed", () => {
    // Here a RangeError out of toFixed in round(): not a base error, so it propagates.
    const toFixed = spyOn(Number.prototype, "toFixed").mockImplementation(() => {
      throw new RangeError("toFixed() digits argument must be between 0 and 100")
    })
    try {
      expect(() => mapOf('center: "[note.n.round(2), 1]"')).toThrow(RangeError)
    } finally {
      toFixed.mockRestore()
    }
  })

  test("own dark tiles go with own light tiles", () => {
    const out = mapOf('mapTiles: "https://a.example/{z}/{x}/{y}.png", mapTilesDark: ["https://d.example/{z}/{x}/{y}.png", "http://insecure/{z}/{x}/{y}"]')
    expect(out).toContain('data-tiles-dark="https://d.example/{z}/{x}/{y}.png"')
    expect(out).toContain('data-attribution=""')
    expect(mapOf('mapTiles: "https://a.example/{z}/{x}/{y}.png"')).not.toContain("data-tiles-dark")
  })

  test("markers with an unknown icon have none; numbers as text bound the zoom", () => {
    const { base, res } = run("views: [{ type: map, markerIcon: note.icon }]")
    expect(mapMarkers(res, base, engine, "en")[0].icon).toBeUndefined()
    expect(mapOf('minZoom: "5", maxZoom: " ", mapHeight: 50')).toContain('data-min-zoom="5" data-max-zoom="18"')
    expect(mapOf("mapHeight: 50")).toContain('style="height:100px"')
  })

  test("a popup titled by an empty first property falls back to the note's title", () => {
    const { base, res } = run("views: [{ type: map, order: [note.topics, note.status] }]")
    const [hanoi, hue] = mapMarkers(res, base, engine, "en")
    expect(hanoi.title).toBe("food, nested, list")
    // Hue's topics are an empty list: skipped, so its status titles the popup.
    expect(hue.title).toBe("blocked")
  })
})

describe("Notion views", () => {
  test("text of nested lists, links without a URL, objects", () => {
    expect(textOf([["a", "b"], "c"], "en")).toBe("a, b, c")
    expect(textOf({ kind: "link", title: "T" }, "en")).toBe("T")
    expect(textOf({ a: 1 }, "en")).toBe('{"a":1}')
    expect(textOf(new Date("2024-01-02"), "en")).toBeTruthy()
    expect(textOf(3, "en")).toBe("3")
    expect(parsePinned("done=green").size).toBe(0)
  })

  test("table: column widths and icons, wrapped columns, no lines, no title icon", () => {
    const { res } = run(`views:
  - type: bases
    order: [file.name, status, topics]
    columnWidths: { status: 120.4, topics: wide }
    columnIcons: { status: circle, topics: not-an-icon, file.name: "" }
    wrapColumns: [status]
    wrapCells: false
    verticalLines: false
    showTitleIcon: false
    rowLimit: 0
    pinnedColors: [blocked=red:40]`)
    const html = renderNotionTable(res, "en")
    expect(html).toContain('<colgroup><col><col style="width:120px"><col></colgroup>')
    expect(html).toMatch(/<th><span class="ntn-col-icon" aria-hidden="true"><svg[^]*?<\/span>status<\/th><th>topics<\/th>/)
    expect(html).toContain('<td class="is-wrapped">done</td>')
    expect(html).toContain('<table class="ntn-table">')
    expect(html).not.toContain("ntn-page-icon")
    expect(html).not.toContain("ntn-extra")
    // An empty list is no pill; nested lists are one pill.
    expect(html).toContain('<span class="ntn-pill" style="--pill-bg:')
    expect(html).toContain(">nested, list</span>")
  })

  test("a pinned colour with partial opacity fades only its background", () => {
    const { res } = run("views: [{ type: bases, order: [file.name, topics], pinnedColors: ['food=red:40'], pillProperties: [topics] }]")
    expect(renderNotionTable(res, "en")).toContain("--pill-bg:color-mix(in srgb, #FDEBEC 40%, transparent);--pill-fg:#D34C47;")
  })

  test("title icons: an unknown name is text, an empty property name shows the page icon", () => {
    const { res } = run("views: [{ type: notion-list, order: [file.name] }]")
    expect(renderNotionList(res, "en")).toContain('<span class="ntn-page-icon" aria-hidden="true">Not-Lucide</span>')
    const blank = run("views: [{ type: notion-list, order: [file.name], titleIconProperty: ' ', rowCount: 'x' }]").res
    expect(renderNotionList(blank, "en").match(/ntn-page-icon" aria-hidden="true"><svg/g)!.length).toBe(2)
  })

  test("board: tinted columns, labelled properties, ungrouped rows and unknown widths", () => {
    const { res } = run(`views:
  - type: notion-board
    groupBy: note.status
    order: [file.name, status, topics]
    groupColorDisplay: both
    propertyLabelDisplay: icon-name
    columnIcons: { status: circle }
    boardColumnWidth: huge
    hiddenGroups: [blocked]`)
    const html = renderNotionBoard(res, "en")
    expect(html).toContain("--ntn-col-width:240px")
    expect(html).toContain('<section class="ntn-col is-tinted" style="--col-bg:')
    expect(html).toContain('<details class="ntn-col is-hidden is-tinted" style="--col-bg:')
    expect(html).toMatch(/<span class="ntn-prop"><span class="ntn-col-icon"[^]*?<\/span><span class="ntn-prop-name">status<\/span>/)
    const bg = renderNotionBoard(run("views: [{ type: notion-board, groupBy: note.status, groupColorDisplay: background, propertyLabelDisplay: name }]").res, "en")
    expect(bg).toContain("ntn-col is-tinted")
    expect(bg).toContain('<span class="ntn-col-name">done</span>')
    const icons = renderNotionBoard(run("views: [{ type: notion-board, order: [file.name, status], propertyLabelDisplay: icon }]").res, "en")
    // Without groupBy every row is in one column, under no group.
    expect(icons).toContain('<span class="ntn-col-name">No status</span><span class="ntn-count">2</span>')
    expect(icons).toContain('<span class="ntn-prop">done</span>')
  })

  test("feed: notes without pill properties have no property row; rows past the page size", () => {
    const html = renderNotionFeed(run("views: [{ type: notion-feed, order: [file.name, status], rowCount: 1 }]").res, "en")
    expect(html).not.toContain("ntn-props")
    expect(html).toContain('<article class="ntn-feed-item ntn-extra">')
  })
})
