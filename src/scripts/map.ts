import L from "leaflet"
// As a URL, not an import: every page shares one stylesheet, and only the map page needs this one.
import leafletCss from "leaflet/dist/leaflet.css?url"

interface Place {
  lat: number
  lng: number
  title: string
  url: string
  description?: string
}

const maps = new Map<HTMLElement, L.Map>()

/**
 * Places as dots, on the map page or a ```leaflet block; a click shows the
 * note's title and links to it. `data-center` and `data-zoom` fix the view.
 */
export function mountMap(el: HTMLElement): void {
  maps.get(el)?.remove()
  if (!document.querySelector("link[data-leaflet]")) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = leafletCss
    link.dataset.leaflet = ""
    document.head.append(link)
  }
  const places = JSON.parse(el.dataset.map ?? "[]") as Place[]
  const map = L.map(el, { scrollWheelZoom: false })
  maps.set(el, map)
  L.tileLayer(el.dataset.tiles!, { attribution: el.dataset.attribution, maxZoom: 18 }).addTo(map)
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2d6a4f"
  for (const p of places) {
    const popup = document.createElement("div")
    // A marker of a ```leaflet block may name a place without a note.
    const a = document.createElement(p.url ? "a" : "strong")
    if (a instanceof HTMLAnchorElement) a.href = p.url
    a.textContent = p.title
    popup.append(a)
    if (p.description) {
      const d = document.createElement("p")
      d.textContent = p.description
      popup.append(d)
    }
    // Circle markers need no image files, which bundlers tend to lose.
    L.circleMarker([p.lat, p.lng], { radius: 8, color: accent, weight: 2, fillOpacity: 0.6 }).bindPopup(popup).addTo(map)
  }
  const center = el.dataset.center?.split(",").map(Number) as [number, number] | undefined
  const zoom = el.dataset.zoom ? Number(el.dataset.zoom) : undefined
  if (center) return void map.setView(center, zoom ?? 13)
  const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng]))
  if (places.length === 1) map.setView(bounds.getCenter(), zoom ?? 10)
  else map.fitBounds(bounds, { padding: [32, 32], ...(zoom != null ? { maxZoom: zoom } : {}) })
}

export function unmountMap(): void {
  for (const map of maps.values()) map.remove()
  maps.clear()
}
