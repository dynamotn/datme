import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { installDom, type Dom } from "./cov-dom"

// A stand-in for Leaflet that records what the script asks of it.
type LatLng = [number, number]
class FakeLayer {
  removed = false
  map?: FakeMap
  popup?: HTMLElement
  constructor(
    public kind: string,
    public at: unknown,
    public opts: Record<string, unknown> = {},
  ) {}
  addTo(map: FakeMap) {
    this.map = map
    map.layers.push(this)
    return this
  }
  bindPopup(el: HTMLElement) {
    this.popup = el
    return this
  }
  remove() {
    this.removed = true
  }
}
class FakeMap {
  layers: FakeLayer[] = []
  removed = false
  view?: { center: unknown; zoom: number }
  fitted?: { bounds: FakeBounds; opts: object }
  constructor(
    public el: HTMLElement,
    public opts: object,
  ) {}
  setView(center: unknown, zoom: number) {
    this.view = { center, zoom }
    return this
  }
  fitBounds(bounds: FakeBounds, opts: object) {
    this.fitted = { bounds, opts }
    return this
  }
  remove() {
    this.removed = true
  }
}
class FakeBounds {
  constructor(public points: LatLng[]) {}
  getCenter() {
    return this.points[0]
  }
}
const made: FakeMap[] = []
const L = {
  map: (el: HTMLElement, opts: object) => {
    const m = new FakeMap(el, opts)
    made.push(m)
    return m
  },
  tileLayer: (url: string, opts: object) => new FakeLayer("tiles", url, opts as Record<string, unknown>),
  marker: (at: LatLng, opts: Record<string, unknown>) => new FakeLayer("marker", at, opts),
  circleMarker: (at: LatLng, opts: Record<string, unknown>) => new FakeLayer("circle", at, opts),
  divIcon: (opts: object) => ({ divIcon: opts }),
  latLngBounds: (points: LatLng[]) => new FakeBounds(points),
}
mock.module("leaflet", () => ({ default: L }))
mock.module("leaflet/dist/leaflet.css?url", () => ({ default: "/assets/leaflet.css" }))

type Maps = typeof import("../src/scripts/map")
let dom: Dom
let maps: Maps
beforeAll(async () => {
  dom = installDom("https://garden.example/map")
  maps = await import("../src/scripts/map")
})
afterAll(() => dom.restore())

const mapEl = (attrs: Record<string, string>) => {
  const el = dom.document.createElement("div")
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  dom.document.body.append(el)
  return el as HTMLElement
}
const tiles = (m: FakeMap) => m.layers.filter((l) => l.kind === "tiles")
const markers = (m: FakeMap) => m.layers.filter((l) => l.kind !== "tiles")

describe("maps", () => {
  test("places become circle markers whose popups link to their notes, fitted into view", () => {
    made.length = 0
    dom.document.body.innerHTML = ""
    dom.document.documentElement.style.setProperty("--accent", "#123456")
    const el = mapEl({
      "data-tiles": "https://tiles/{z}/{x}/{y}.png https://labels/{z}.png",
      "data-attribution": "© OSM",
      "data-map": JSON.stringify([
        { lat: 1, lng: 2, title: "Hanoi", url: "/hanoi", description: "Capital" },
        { lat: 3, lng: 4, title: "Unnamed spot", url: "" },
      ]),
    })
    maps.mountMap(el)
    expect(dom.document.querySelectorAll("link[data-leaflet]")).toHaveLength(1)
    expect(dom.document.querySelector<HTMLLinkElement>("link[data-leaflet]")!.getAttribute("href")).toBe("/assets/leaflet.css")
    const [m] = made
    expect(m.opts).toEqual({ scrollWheelZoom: false })
    expect(tiles(m).map((t) => [t.at, t.opts.attribution, t.opts.maxZoom])).toEqual([
      ["https://tiles/{z}/{x}/{y}.png", "© OSM", 18],
      ["https://labels/{z}.png", undefined, 18],
    ])
    const [a, b] = markers(m)
    expect(a.kind).toBe("circle")
    expect(a.opts.color).toBe("#123456")
    expect(a.popup!.innerHTML).toBe(`<a href="/hanoi">Hanoi</a><p>Capital</p>`)
    expect(b.popup!.innerHTML).toBe(`<strong>Unnamed spot</strong>`)
    expect(m.fitted!.bounds.points).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(m.fitted!.opts).toEqual({ padding: [32, 32] })
  })

  test("a base's map view draws coloured pins with icons and its own popups", () => {
    made.length = 0
    dom.document.documentElement.style.removeProperty("--accent")
    const el = mapEl({
      "data-tiles": "https://tiles/a.png",
      "data-map": JSON.stringify([
        { lat: 1, lng: 2, title: "Pinned", url: "/p", color: "red", icon: "<svg class='i'></svg>", popup: "<b>Pinned</b>" },
        { lat: 5, lng: 6, title: "Iconed", url: "/q", icon: "<svg></svg>" },
        { lat: 7, lng: 8, title: "Plain", url: "/r" },
      ]),
      "data-zoom": "7",
      "data-min-zoom": "3",
      "data-max-zoom": "12",
    })
    maps.mountMap(el)
    const [m] = made
    expect(m.opts).toEqual({ scrollWheelZoom: false, minZoom: 3, maxZoom: 12 })
    expect(tiles(m)[0].opts.maxZoom).toBe(12)
    const [pinned, iconed, plain] = markers(m)
    expect(pinned.kind).toBe("marker")
    expect(pinned.opts.title).toBe("Pinned")
    const icon = (pinned.opts.icon as { divIcon: { html: HTMLElement; className: string } }).divIcon
    expect(icon.className).toBe("base-marker-wrap")
    expect(icon.html.style.getPropertyValue("--marker")).toBe("red")
    expect(icon.html.innerHTML).toBe(`<svg class="i"></svg>`)
    expect(pinned.popup!.className).toBe("map-popup")
    expect(pinned.popup!.innerHTML).toBe("<b>Pinned</b>")
    expect(iconed.kind).toBe("marker")
    expect((iconed.opts.icon as { divIcon: { html: HTMLElement } }).divIcon.html.style.getPropertyValue("--marker")).toBe("")
    expect(plain.kind).toBe("circle")
    expect(plain.opts.color).toBe("#2d6a4f")
    expect(m.fitted!.opts).toEqual({ padding: [32, 32], maxZoom: 7 })
  })

  test("a fixed centre sets the view, at zoom 13 unless given; one place is centred at zoom 10", () => {
    made.length = 0
    const centred = mapEl({ "data-tiles": "t", "data-center": "10.5,106.7", "data-map": "[]" })
    maps.mountMap(centred)
    expect(made[0].view).toEqual({ center: [10.5, 106.7], zoom: 13 })
    const zoomed = mapEl({ "data-tiles": "t", "data-center": "1,2", "data-zoom": "5" })
    maps.mountMap(zoomed)
    expect(made[1].view).toEqual({ center: [1, 2], zoom: 5 })
    const one = mapEl({ "data-tiles": "t", "data-map": JSON.stringify([{ lat: 9, lng: 8, title: "One", url: "/one" }]) })
    maps.mountMap(one)
    expect(made[2].view).toEqual({ center: [9, 8], zoom: 10 })
    const oneZoomed = mapEl({ "data-tiles": "t", "data-zoom": "4", "data-map": JSON.stringify([{ lat: 9, lng: 8, title: "One", url: "/one" }]) })
    maps.mountMap(oneZoomed)
    expect(made[3].view).toEqual({ center: [9, 8], zoom: 4 })
    expect(dom.document.querySelectorAll("link[data-leaflet]")).toHaveLength(1)
  })

  test("mounting again replaces the map; a theme change swaps in the dark tiles; unmounting removes all", () => {
    maps.unmountMap()
    made.length = 0
    const el = mapEl({ "data-tiles": "https://light.png", "data-tiles-dark": "https://dark.png", "data-map": "[]" })
    maps.mountMap(el)
    maps.mountMap(el)
    expect(made[0].removed).toBe(true)
    const m = made[1]
    expect(tiles(m).map((t) => t.at)).toEqual(["https://light.png"])
    dom.document.documentElement.dataset.theme = "dark"
    maps.retileMaps()
    expect(tiles(m)[0].removed).toBe(true)
    expect(tiles(m).map((t) => t.at)).toEqual(["https://light.png", "https://dark.png"])
    // Without dark tiles, a dark page keeps the light ones.
    const light = mapEl({ "data-tiles": "https://only-light.png", "data-map": "[]" })
    maps.mountMap(light)
    expect(tiles(made[2]).map((t) => t.at)).toEqual(["https://only-light.png"])
    maps.unmountMap()
    expect(m.removed).toBe(true)
    expect(made[2].removed).toBe(true)
    maps.retileMaps()
    expect(tiles(m)).toHaveLength(2)
  })
})
