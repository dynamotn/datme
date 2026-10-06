import { site, type Lang } from "../site.config"
import { listed, type Note } from "./vault"
import { t } from "./i18n"

// ---------- timeline ----------

/** A point in time as precise as the note gives it: a year, a month or a day. */
export interface When {
  year: number
  month?: number
  day?: number
}

/** "1927", "1927-12", "1927-12-08", "-0500" (500 BCE), a number or a full timestamp. */
export function parseWhen(v: unknown): When | undefined {
  if (typeof v === "number" && Number.isInteger(v)) return { year: v }
  if (typeof v !== "string") return undefined
  const m = v.trim().match(/^(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?(?:[T ].*)?$/)
  if (!m) return undefined
  const when: When = { year: Number(m[1]) }
  if (m[2]) when.month = Number(m[2])
  if (m[3]) when.day = Number(m[3])
  if ((when.month && (when.month < 1 || when.month > 12)) || (when.day && (when.day < 1 || when.day > 31))) return undefined
  return when
}

export const whenKey = (w: When) => w.year * 10_000 + (w.month ?? 0) * 100 + (w.day ?? 0)

/** A date as precise as it was written, in the reader's language. */
export function formatWhen(w: When, lang: Lang): string {
  // Years before 100 would be read as 19xx by Date; and BCE needs a sign anyway.
  if (w.year < 100 || !w.month) return w.year < 0 ? t(lang).bce.replace("{n}", String(-w.year)) : String(w.year)
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day ?? 1))
  return d.toLocaleDateString(lang, { year: "numeric", month: w.day ? "short" : "long", day: w.day ? "numeric" : undefined, timeZone: "UTC" })
}

export interface Event {
  note: Note
  start: When
  end?: When
}

/** Notes with a `start`, or tagged as events: what the timeline shows, oldest first. */
export function timeline(lang: Lang): Event[] {
  const events: Event[] = []
  const tags = site.conventions.timelineTags
  for (const n of listed(lang)) {
    if (n.protected || n.isHome) continue
    const fm = n.source.fm
    const tagged = n.tags.some((t) => tags.some((x) => t === x || t.startsWith(x + "/")))
    const start = parseWhen(fm.start) ?? (tagged ? (parseWhen(fm.date) ?? (n.created && dayOf(n.created))) : undefined)
    if (!start) continue
    events.push({ note: n, start, end: parseWhen(fm.end) })
  }
  return events.sort((a, b) => whenKey(a.start) - whenKey(b.start) || a.note.title.localeCompare(b.note.title))
}

const dayOf = (d: Date): When => ({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() })

// ---------- map ----------

export interface Place {
  lat: number
  lng: number
  title: string
  url: string
  description?: string
}

/** [lat, lng], "lat, lng" or { lat, lng }, under location or coordinates. */
export function parseLocation(v: unknown): [number, number] | undefined {
  let pair: unknown[] | undefined
  if (Array.isArray(v)) pair = v
  else if (typeof v === "string") pair = v.split(",")
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    pair = [o.lat ?? o.latitude, o.lng ?? o.lon ?? o.long ?? o.longitude]
  }
  if (!pair || pair.length !== 2) return undefined
  const [lat, lng] = pair.map((x) => Number(String(x).trim()))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined
  return [lat, lng]
}

/** Notes with a location, for the map page. */
export function places(lang: Lang): Place[] {
  const out: Place[] = []
  for (const n of listed(lang)) {
    if (n.protected) continue
    const loc = parseLocation(n.source.fm.location ?? n.source.fm.coordinates)
    if (!loc) continue
    out.push({ lat: loc[0], lng: loc[1], title: n.title, url: n.url, description: n.description })
  }
  return out
}

/** Whether a language has anything to show on the timeline or the map, so empty pages are not built. */
export function hasTimeline(lang: Lang): boolean {
  return timeline(lang).length > 0
}
export function hasMap(lang: Lang): boolean {
  return places(lang).length > 0
}
