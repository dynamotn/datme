import L from "leaflet"
// As a URL, not an import: every page shares one stylesheet, and only the map page needs this one.
import leafletCss from "leaflet/dist/leaflet.css?url"

interface Place {
  lat: number
  lng: number
  title: string
  url: string
  description?: string
  /** A map view of a base: the marker's CSS colour, its icon as SVG, and its popup as HTML. */
  color?: string
  icon?: string
  popup?: string
}

const maps = new Map<HTMLElement, L.Map>()
const layers = new Map<HTMLElement, L.TileLayer[]>()

/**
 * Tiles for the page's colour scheme: the dark ones when there are, else the
 * light ones, inverted by CSS. Several URLs, space-separated, stack as layers.
 */
const tilesOf = (el: HTMLElement) => ((document.documentElement.dataset.theme === "dark" && el.dataset.tilesDark) || el.dataset.tiles!).split(" ")

function addTiles(el: HTMLElement, map: L.Map): void {
  const maxZoom = el.dataset.maxZoom ? Number(el.dataset.maxZoom) : 18
  layers.set(
    el,
    tilesOf(el).map((url, i) => L.tileLayer(url, { attribution: i ? undefined : el.dataset.attribution, maxZoom }).addTo(map)),
  )
}

/** A round marker in the colour of the note, with its icon in the middle, as the Maps plugin draws them. */
function pin(p: Place): L.DivIcon {
  const span = document.createElement("span")
  span.className = "base-marker"
  if (p.color) span.style.setProperty("--marker", p.color)
  // The SVG of a Lucide icon, read from the package at build time.
  if (p.icon) span.innerHTML = p.icon
  return L.divIcon({ html: span, className: "base-marker-wrap", iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12] })
}

/**
 * Places as dots, on the map page, a ```leaflet block or a map view of a
 * base; a click shows the note's title and links to it. `data-center` and
 * `data-zoom` fix the view, `data-min-zoom` and `data-max-zoom` bound it.
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
  const map = L.map(el, {
    scrollWheelZoom: false,
    ...(el.dataset.minZoom ? { minZoom: Number(el.dataset.minZoom) } : {}),
    ...(el.dataset.maxZoom ? { maxZoom: Number(el.dataset.maxZoom) } : {}),
  })
  maps.set(el, map)
  addTiles(el, map)
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2d6a4f"
  for (const p of places) {
    const popup = document.createElement("div")
    if (p.popup != null) {
      // Built at build time from the notes' properties, escaped there.
      popup.className = "map-popup"
      popup.innerHTML = p.popup
    } else {
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
    }
    // Circle markers need no image files, which bundlers tend to lose.
    const marker =
      p.color || p.icon
        ? L.marker([p.lat, p.lng], { icon: pin(p), title: p.title })
        : L.circleMarker([p.lat, p.lng], { radius: 8, color: accent, weight: 2, fillOpacity: 0.6 })
    marker.bindPopup(popup).addTo(map)
  }
  // A trip's route joins its places in order.
  if (el.dataset.route != null)
    L.polyline(
      places.map((p) => [p.lat, p.lng]),
      { color: accent, weight: 3, opacity: 0.7, dashArray: "6 8" },
    ).addTo(map)
  const center = el.dataset.center?.split(",").map(Number) as [number, number] | undefined
  const zoom = el.dataset.zoom ? Number(el.dataset.zoom) : undefined
  if (center) return void map.setView(center, zoom ?? 13)
  // No places (an empty base view, say): Leaflet cannot fit a map to nothing, so show the world.
  if (!places.length) return void map.setView([0, 0], zoom ?? 2)
  const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng]))
  if (places.length === 1) map.setView(bounds.getCenter(), zoom ?? 10)
  else map.fitBounds(bounds, { padding: [32, 32], ...(zoom != null ? { maxZoom: zoom } : {}) })
}

/** Swap the tiles of every map when the theme changes and the site has dark ones. */
export function retileMaps(): void {
  for (const [el, map] of maps) {
    for (const layer of layers.get(el) ?? []) layer.remove()
    addTiles(el, map)
  }
}

export function unmountMap(): void {
  for (const map of maps.values()) map.remove()
  maps.clear()
  layers.clear()
}
