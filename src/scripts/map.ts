import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface Place {
  lat: number
  lng: number
  title: string
  url: string
  description?: string
}

let map: L.Map | undefined

/** The places of the map page as dots; a click shows the note's title and links to it. */
export function mountMap(el: HTMLElement): void {
  map?.remove()
  const places = JSON.parse(el.dataset.map ?? "[]") as Place[]
  map = L.map(el, { scrollWheelZoom: false })
  L.tileLayer(el.dataset.tiles!, { attribution: el.dataset.attribution, maxZoom: 18 }).addTo(map)
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2d6a4f"
  for (const p of places) {
    const popup = document.createElement("div")
    const a = document.createElement("a")
    a.href = p.url
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
  const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng]))
  if (places.length === 1) map.setView(bounds.getCenter(), 10)
  else map.fitBounds(bounds, { padding: [32, 32] })
}

export function unmountMap(): void {
  map?.remove()
  map = undefined
}
