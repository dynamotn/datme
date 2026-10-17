import { describe, expect, test } from "bun:test"
import { parseBase, runView, BaseError } from "../src/lib/bases"
import { mapMarkers, renderMapView } from "../src/lib/base-map"
import { colorFor, parsePinned, renderNotionBoard, renderNotionFeed, renderNotionList, renderNotionTable } from "../src/lib/base-notion"
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
  page("Places/Hanoi", { coordinates: [21.0278, 105.8342], kind: "city", color: "red", icon: "landmark", status: "done", topics: ["food", "history"] }),
  page("Places/Hue", { coordinates: "16.4637, 107.5909", kind: "city", status: "doing", topics: ["history"] }),
  page("Places/Nowhere", { kind: "idea", icon: "🌱" }),
]
const engine: Engine = { pages, resolve: (t) => pages.find((p) => p.stem === t) }
const run = (src: string, view = 0) => {
  const base = parseBase(src)
  return { base, res: runView(base, base.views[view], engine) }
}

describe("view types", () => {
  test("plugin views keep their type; the Extended Base table is stored as `bases`", () => {
    const base = parseBase("views: [{ type: map }, { type: bases }, { type: notion-list }, { type: notion-board }, { type: notion-feed }, { type: gantt }]")
    expect(base.views.map((v) => v.type)).toEqual(["map", "notion-table", "notion-list", "notion-board", "notion-feed", "table"])
    expect(base.views[0].options).toEqual({ type: "map" })
  })

  test("groupBy groups rows by value, in its direction, with the rows without one last", () => {
    const { res } = run("views: [{ type: table, groupBy: { property: note.status, direction: DESC } }]")
    expect(res.groups!.map((g) => [g.key, g.rows.map((r) => r.page.stem)])).toEqual([
      ["done", ["Hanoi"]],
      ["doing", ["Hue"]],
      [null, ["Nowhere"]],
    ])
    expect(run("views: [{ type: table, groupBy: note.kind }]").res.groups!.map((g) => g.key)).toEqual(["city", "idea"])
    expect(run("views: [{ type: table }]").res.groups).toBeUndefined()
    expect(() => parseBase("views: [{ groupBy: { direction: ASC } }]")).toThrow(BaseError)
  })
})

describe("map view", () => {
  test("markers at the coordinates property, list or text, coloured and with an icon", () => {
    const { base, res } = run("views: [{ type: map, coordinates: note.coordinates, markerColor: note.color, markerIcon: note.icon, order: [file.name, kind] }]")
    const markers = mapMarkers(res, base, engine, "en")
    expect(markers.map((m) => [m.title, m.lat, m.lng])).toEqual([
      ["Hanoi", 21.0278, 105.8342],
      ["Hue", 16.4637, 107.5909],
    ])
    expect(markers[0].color).toBe("red")
    expect(markers[0].icon).toStartWith("<svg")
    expect(markers[1].color).toBeUndefined()
    // The first property is the popup's title, linked to the note; the rest are rows.
    expect(markers[0].popup).toContain('<a class="internal" href="/places/hanoi"')
    expect(markers[0].popup).toContain("<dt>kind</dt><dd>city</dd>")
  })

  test("a colour that is not CSS is dropped, and the coordinates property is skipped in the popup", () => {
    const evil = [page("X", { coordinates: [1, 2], color: "red;background:url(x)" })]
    const base = parseBase("views: [{ type: map, coordinates: note.coordinates, markerColor: note.color, order: [file.name, note.coordinates] }]")
    const res = runView(base, base.views[0], { pages: evil, resolve: () => undefined })
    const [m] = mapMarkers(res, base, engine, "en")
    expect(m.color).toBeUndefined()
    expect(m.popup).not.toContain("<dl>")
  })

  test("centre, zoom bounds, height and tiles as the Maps plugin stores them", () => {
    const src = (extra: string) => `views: [{ type: map, coordinates: note.coordinates, ${extra} }]`
    const htmlOf = (extra: string, embedded = true) => {
      const { base, res } = run(src(extra))
      return renderMapView(res, base, engine, "en", embedded)
    }
    const fixed = htmlOf('center: "[10.5, 106]", defaultZoom: 30, minZoom: 3, maxZoom: 12, mapHeight: 300')
    expect(fixed).toContain('data-center="10.5,106" data-zoom="12"')
    expect(fixed).toContain('data-min-zoom="3" data-max-zoom="12"')
    expect(fixed).toContain('style="height:300px"')
    // On the base's own page the map takes the screen, whatever the view says.
    expect(htmlOf("mapHeight: 300", false)).not.toContain("height:300px")
    // A zoom alone looks at the middle of the markers.
    expect(htmlOf("defaultZoom: 6")).toContain(`data-center="${(21.0278 + 16.4637) / 2},${(105.8342 + 107.5909) / 2}" data-zoom="6"`)
    expect(htmlOf('mapTiles: ["https://tiles.example/{z}/{x}/{y}.png"]')).toContain('data-tiles="https://tiles.example/{z}/{x}/{y}.png"')
    // A MapLibre style URL cannot be drawn by Leaflet: the site's tiles instead.
    expect(htmlOf("mapTiles: https://tiles.openfreemap.org/styles/bright")).toContain('data-tiles="https://tile.openstreetmap.org/{z}/{x}/{y}.png"')
  })

  test("without a coordinates property, the location the site's map reads", () => {
    const { base, res } = run("views: [{ type: map }]")
    expect(mapMarkers(res, base, engine, "en").map((m) => m.title)).toEqual(["Hanoi", "Hue"])
  })
})

describe("Notion-style views", () => {
  test("pills: the plugin's colour hash and pinned colours", () => {
    expect(colorFor("history").name).toBe(colorFor("history").name)
    const pinned = parsePinned(["#Done=green", "blocked=red:40", "bad=chartreuse", "nope"])
    expect([...pinned.keys()]).toEqual(["done", "blocked"])
    expect(pinned.get("blocked")).toMatchObject({ opacity: 40, color: { name: "red" } })
  })

  test("table: title with icon, lists as pills, hidden and renamed columns, rows past the limit", () => {
    const { res } = run(`views:
  - type: bases
    order: [file.name, kind, topics, status]
    columnNames: { kind: Type }
    hiddenColumns: [status]
    pillProperties: [kind]
    pinnedColors: [city=blue]
    rowLimit: 2`)
    const html = renderNotionTable(res, "en")
    expect(html).toContain("<th>Type</th>")
    expect(html).not.toContain(">status<")
    expect(html).toContain('class="ntn-title internal" href="/places/hanoi"')
    // The landmark icon is Lucide's; an emoji stays text; no icon is a page.
    expect(html).toMatch(/ntn-page-icon" aria-hidden="true"><svg/)
    expect(html).toContain("🌱")
    expect(html).toContain('<span class="ntn-pill" style="--pill-bg:#E7F3F8;')
    expect(html.match(/ntn-pill/g)!.length).toBe(6)
    expect(html).toContain('<tr class="ntn-extra">')
    expect(html).toContain("Show 1 more")
  })

  test("list and feed: page sizes, `all` showing everything", () => {
    const list = renderNotionList(run("views: [{ type: notion-list, order: [file.name, topics], rowCount: '1' }]").res, "en")
    expect(list.match(/ntn-extra/g)!.length).toBe(2)
    expect(renderNotionList(run("views: [{ type: notion-list, rowCount: all }]").res, "en")).not.toContain("ntn-more")
    const feed = renderNotionFeed(run("views: [{ type: notion-feed, order: [file.name, kind, topics] }]").res, "en")
    // Each note's body is embedded; only pill properties show above it.
    expect(feed).toContain('<span class="transclude-ph" data-key="Places/Hanoi" data-fragment=""></span>')
    expect(feed).toContain(">food<")
    expect(feed).not.toContain(">city<")
  })

  test("board: a column per group, hidden groups folded, the view's properties on the cards", () => {
    const { res } = run(`views:
  - type: notion-board
    groupBy: { property: note.status }
    order: [file.name, status, kind]
    hiddenGroups: [No Status]
    groupColorDisplay: label
    boardColumnWidth: large`)
    const html = renderNotionBoard(res, "en")
    expect(html).toContain("--ntn-col-width:320px")
    expect(html.match(/<section class="ntn-col"/g)!.length).toBe(2)
    expect(html).toContain('<details class="ntn-col is-hidden"><summary class="ntn-col-head"><span class="ntn-col-name">No status</span>')
    expect(html).toContain('<span class="ntn-pill" style="--pill-bg:')
    expect(html).toContain('<span class="ntn-prop">doing</span><span class="ntn-prop">city</span>')
  })
})
