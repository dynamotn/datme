/**
 * The map view of Obsidian's Maps plugin: a marker for each note of the view
 * at the coordinates its `coordinates` property names, coloured and drawn with
 * the icon its `markerColor` and `markerIcon` properties give. Popups show the
 * view's properties, the first as the title. Drawn with Leaflet like the /map
 * page; MapLibre style URLs are Obsidian-only, so those fall back to the site's tiles.
 */
import { site, type Lang } from "../site.config"
import { t } from "./i18n"
import { escapeAttr } from "./obsidian"
import { html } from "./dataview-render"
import { lucideSvg } from "./icons"
import { parseLocation } from "./places"
import { property, BaseError, type BaseFile, type ViewResult } from "./bases"
import type { Engine } from "./dataview"
import { textOf } from "./base-notion"

export interface MapMarker {
  lat: number
  lng: number
  title: string
  url: string
  color?: string
  icon?: string
  popup?: string
}

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined
}

/** A CSS colour as the plugin passes it on: a name, hex, rgb(), hsl() or var(--x). */
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgba?|hsla?|var)\([\w\s,.%#-]*\))$/i

/** Tile URL templates; a single URL without {z}/{x}/{y} is a MapLibre style, which Leaflet cannot draw. */
function tiles(v: unknown): string[] {
  const urls = (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map((u) => String(u).trim()).filter((u) => /^https:\/\/\S+$/.test(u))
  return urls.filter((u) => /\{z\}/.test(u) && /\{x\}/.test(u) && /\{y\}/.test(u))
}

/** `center: [48.85, 2.29]` as a formula, or the older "48.85, 2.29" text. */
function centerOf(v: unknown, base: BaseFile, engine: Engine): [number, number] | undefined {
  if (v == null || v === "") return undefined
  const plain = parseLocation(Array.isArray(v) ? v : String(v).replace(/^\s*\[|\]\s*$/g, ""))
  if (plain) return plain
  const page = engine.current ?? engine.pages[0]
  if (!page) return undefined
  try {
    return parseLocation(property(String(v), page, engine, base.formulas))
  } catch (e) {
    if (e instanceof BaseError) return undefined
    throw e
  }
}

export function mapMarkers(res: ViewResult, base: BaseFile, engine: Engine, lang: Lang): MapMarker[] {
  const o = res.view.options
  const coords = typeof o.coordinates === "string" && o.coordinates ? o.coordinates : undefined
  const iconProp = typeof o.markerIcon === "string" && o.markerIcon ? o.markerIcon : undefined
  const colorProp = typeof o.markerColor === "string" && o.markerColor ? o.markerColor : undefined
  const skip = new Set([coords, iconProp, colorProp])
  const shown = res.columns.map((c, i) => ({ ...c, i })).filter((c) => !skip.has(c.id))
  const out: MapMarker[] = []
  for (const row of res.rows) {
    const fm = row.page.fields
    // The plugin draws nothing until a property is picked; the site's own map reads these two.
    const loc = parseLocation(coords ? property(coords, row.page, engine, base.formulas) : (fm.coordinates ?? fm.location))
    if (!loc) continue
    const at = (id: string | undefined) => (id ? property(id, row.page, engine, base.formulas) : null)
    const color = textOf(at(colorProp), lang).trim()
    const icon = textOf(at(iconProp), lang).trim()
    const props = shown.filter((c) => row.cells[c.i] != null && row.cells[c.i] !== "" && !(Array.isArray(row.cells[c.i]) && !(row.cells[c.i] as unknown[]).length)).slice(0, 20)
    const [first, ...rest] = props
    const titleText = first ? textOf(row.cells[first.i], lang) || row.page.title : row.page.title
    const popup =
      `<a class="internal" href="${escapeAttr(row.page.url)}" data-key="${escapeAttr(row.page.key)}">${escapeAttr(titleText)}</a>` +
      (rest.length ? `<dl>${rest.map((c) => `<dt>${escapeAttr(c.name)}</dt><dd>${html(row.cells[c.i], lang)}</dd>`).join("")}</dl>` : "")
    out.push({
      lat: loc[0],
      lng: loc[1],
      title: titleText,
      url: row.page.url,
      ...(COLOR.test(color) ? { color } : {}),
      ...(icon && lucideSvg(icon) ? { icon: lucideSvg(icon) } : {}),
      popup,
    })
  }
  return out
}

export function renderMapView(res: ViewResult, base: BaseFile, engine: Engine, lang: Lang, embedded: boolean): string {
  const s = t(lang)
  const o = res.view.options
  const markers = mapMarkers(res, base, engine, lang)
  const minZoom = num(o.minZoom, 0, 24) ?? 0
  const maxZoom = Math.max(minZoom, num(o.maxZoom, 0, 24) ?? 18)
  const zoom = num(o.defaultZoom, minZoom, maxZoom)
  let center = centerOf(o.center, base, engine)
  // A zoom without a centre looks at the middle of the markers; a centre without a zoom at the plugin's default.
  if (!center && zoom != null && markers.length) {
    const lats = markers.map((m) => m.lat)
    const lngs = markers.map((m) => m.lng)
    center = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2]
  }
  if (!center && !markers.length) center = [0, 0]
  const light = tiles(o.mapTiles)
  const dark = tiles(o.mapTilesDark)
  const own = light.length > 0
  // Only an embedded map takes its height from the view; on the base's own page it fills the screen.
  const height = embedded ? `${num(o.mapHeight, 100, 2000) ?? 400}px` : ""
  const list = markers.map((m) => `<li><a class="internal" href="${escapeAttr(m.url)}">${escapeAttr(m.title)}</a></li>`).join("")
  return (
    `<figure class="leaflet-block base-map${embedded ? "" : " is-page"}">` +
    `<div class="map-canvas" role="region" aria-label="${escapeAttr(s.map)}"${height ? ` style="height:${height}"` : ""}` +
    ` data-map="${escapeAttr(JSON.stringify(markers))}"` +
    ` data-tiles="${escapeAttr(own ? light.join(" ") : site.map.tiles)}"` +
    (own ? (dark.length ? ` data-tiles-dark="${escapeAttr(dark.join(" "))}"` : "") : site.map.darkTiles ? ` data-tiles-dark="${escapeAttr(site.map.darkTiles)}"` : "") +
    ` data-attribution="${escapeAttr(own ? "" : site.map.attribution)}"` +
    ` data-min-zoom="${minZoom}" data-max-zoom="${maxZoom}"` +
    (center ? ` data-center="${center.join(",")}" data-zoom="${zoom ?? (markers.length ? 4 : 1)}"` : zoom != null ? ` data-zoom="${zoom}"` : "") +
    `></div>` +
    (list ? `<ul class="map-list">${list}</ul>` : "") +
    `</figure>`
  )
}
