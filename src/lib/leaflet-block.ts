/**
 * ```leaflet blocks of the Obsidian Leaflet plugin: a map of the real world
 * with markers, drawn in the browser with Leaflet like the /map page. Markers
 * come from `marker:` lines, from notes named by `markerFile:` and from notes
 * tagged by `markerTag:`, using their `location` frontmatter. Image maps and
 * GeoJSON overlays are Obsidian-only.
 */
import { site, type Lang } from "../site.config"
import { getVault, listed } from "./vault"
import { parseLocation, type Place } from "./places"
import { escapeAttr } from "./obsidian"
import { t } from "./i18n"

export interface LeafletMap {
  center?: [number, number]
  zoom?: number
  height: string
  markers: Place[]
  /** Lines datme cannot honour, such as image maps. */
  unsupported: string[]
}

interface Resolver {
  /** A published note by link target: its title, URL and location. */
  note(target: string): { title: string; url: string; description?: string; location?: [number, number] } | undefined
  /** Published notes with a location and this tag (without #). */
  tagged(tag: string): Place[]
}

const unlink = (s: string) => s.trim().replace(/^\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim()

export function parseLeafletBlock(src: string, r: Resolver): LeafletMap {
  const out: LeafletMap = { height: "500px", markers: [], unsupported: [] }
  let lat: number | undefined
  let lng: number | undefined
  for (const raw of src.split("\n")) {
    const m = raw.match(/^\s*([A-Za-z]+)\s*:\s*(.*?)\s*$/)
    if (!m) continue
    const [, key, value] = m
    switch (key) {
      case "lat":
        lat = Number(value)
        break
      case "long":
      case "lng":
        lng = Number(value)
        break
      case "coordinates": {
        const loc = parseLocation(value.replace(/^\[|\]$/g, ""))
        if (loc) [lat, lng] = loc
        break
      }
      case "defaultZoom":
      case "zoom":
        if (Number.isFinite(Number(value))) out.zoom = Number(value)
        break
      case "height":
        if (/^\d+(\.\d+)?(px|%|vh|em|rem)?$/.test(value)) out.height = /\d$/.test(value) ? `${value}px` : value
        break
      case "marker": {
        // type, lat, long, link, description: the type picks an icon in Obsidian; every marker is a dot here.
        const [, mlat, mlng, link, ...rest] = value.split(",").map((x) => x.trim())
        const loc = parseLocation([mlat, mlng])
        if (!loc) break
        const target = link ? unlink(link) : ""
        const web = /^https?:/.test(target)
        const note = target && !web ? r.note(target) : undefined
        const description = rest.join(", ").trim() || undefined
        // A note names its marker; otherwise the description does, then the link, then the place.
        const title = note?.title ?? description ?? ((!web && target) || (web ? target : `${loc[0]}, ${loc[1]}`))
        const extra = note ? (description ?? note.description) : undefined
        out.markers.push({ lat: loc[0], lng: loc[1], title, url: note?.url ?? (web ? target : ""), ...(extra ? { description: extra } : {}) })
        break
      }
      case "markerFile":
        for (const target of value.split(/,(?![^[]*\]\])/)) {
          const note = r.note(unlink(target))
          if (note?.location) out.markers.push({ lat: note.location[0], lng: note.location[1], title: note.title, url: note.url, description: note.description })
        }
        break
      case "markerTag":
        for (const tag of value.split(/[,\s]+/).filter(Boolean)) out.markers.push(...r.tagged(tag.replace(/^#/, "")))
        break
      case "image":
      case "geojson":
      case "overlay":
        out.unsupported.push(key)
        break
    }
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) out.center = [lat!, lng!]
  // One marker per place: a note named twice, by file and by tag, shows once.
  const seen = new Set<string>()
  out.markers = out.markers.filter((p) => {
    const id = `${p.lat},${p.lng},${p.url || p.title}`
    return seen.has(id) ? false : (seen.add(id), true)
  })
  return out
}

/** The resolver of a language: published notes only, protected ones never. */
export function vaultResolver(lang: Lang): Resolver {
  const vault = getVault()
  return {
    note(target) {
      const s = vault.resolveNote(target, "")
      const n = s && vault.byKey[lang].get(s.key)
      if (!n || n.protected) return undefined
      return { title: n.title, url: n.url, description: n.description, location: parseLocation(n.source.fm.location ?? n.source.fm.coordinates) }
    },
    tagged(tag) {
      return listed(lang)
        .filter((n) => !n.protected && n.tags.some((x) => x === tag || x.startsWith(tag + "/")))
        .flatMap((n) => {
          const loc = parseLocation(n.source.fm.location ?? n.source.fm.coordinates)
          return loc ? [{ lat: loc[0], lng: loc[1], title: n.title, url: n.url, description: n.description }] : []
        })
    },
  }
}

export function renderLeafletBlock(src: string, lang: Lang): string {
  const s = t(lang)
  const map = parseLeafletBlock(src, vaultResolver(lang))
  if (!map.markers.length && !map.center) {
    return `<p class="dataview dv-note">🗺️ ${escapeAttr(s.dvUnsupported)} (leaflet: ${escapeAttr(map.unsupported.join(", ") || "no place")})</p>`
  }
  const list = map.markers
    .map((p) => `<li>${p.url ? `<a href="${escapeAttr(p.url)}"${p.url.startsWith("/") ? ' class="internal"' : ""}>${escapeAttr(p.title)}</a>` : escapeAttr(p.title)}${p.description ? ` · ${escapeAttr(p.description)}` : ""}</li>`)
    .join("")
  return (
    `<figure class="leaflet-block">` +
    `<div class="map-canvas" role="region" aria-label="${escapeAttr(s.map)}" style="height:${escapeAttr(map.height)}"` +
    ` data-map="${escapeAttr(JSON.stringify(map.markers))}" data-tiles="${escapeAttr(site.map.tiles)}"${site.map.darkTiles ? ` data-tiles-dark="${escapeAttr(site.map.darkTiles)}"` : ""} data-attribution="${escapeAttr(site.map.attribution)}"` +
    (map.center ? ` data-center="${map.center.join(",")}"` : "") +
    (map.zoom != null ? ` data-zoom="${map.zoom}"` : "") +
    `></div>` +
    (list ? `<ul class="map-list">${list}</ul>` : "") +
    `</figure>`
  )
}
