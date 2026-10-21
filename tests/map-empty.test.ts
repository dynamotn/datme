import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"

// A stand-in for Leaflet that, like it, refuses to fit a map to no places at all.
type LatLng = [number, number]
class FakeMap {
  view?: { center: unknown; zoom: number }
  setView(center: unknown, zoom: number) {
    this.view = { center, zoom }
    return this
  }
  fitBounds(bounds: { points: LatLng[] }) {
    if (!bounds.points.length) throw new Error("Bounds are not valid.")
    return this
  }
  remove() {}
}
const made: FakeMap[] = []
const layer = () => ({ addTo: () => layer(), bindPopup: () => layer(), remove() {} })
const L = {
  map: () => {
    const m = new FakeMap()
    made.push(m)
    return m
  },
  tileLayer: layer,
  marker: layer,
  circleMarker: layer,
  polyline: layer,
  divIcon: () => ({}),
  latLngBounds: (points: LatLng[]) => ({ points, getCenter: () => points[0] }),
}
mock.module("leaflet", () => ({ default: L }))
mock.module("leaflet/dist/leaflet.css?url", () => ({ default: "/assets/leaflet.css" }))

let dom: Dom
let maps: typeof import("../src/scripts/map")
beforeAll(async () => {
  dom = installDom("https://garden.example/map")
  maps = await import("../src/scripts/map")
})
afterAll(() => {
  maps.unmountMap()
  dom.restore()
})

test("a map with no places and no centre shows the whole world instead of failing", () => {
  made.length = 0
  const el = dom.document.createElement("div")
  el.setAttribute("data-tiles", "https://tiles/{z}/{x}/{y}.png")
  el.setAttribute("data-map", "[]")
  dom.document.body.append(el)
  expect(() => maps.mountMap(el as HTMLElement)).not.toThrow()
  expect(made[0].view).toEqual({ center: [0, 0], zoom: 2 })
  el.setAttribute("data-zoom", "4")
  maps.mountMap(el as HTMLElement)
  expect(made[1].view).toEqual({ center: [0, 0], zoom: 4 })
})
