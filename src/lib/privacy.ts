/**
 * How a link to a note that is not published shows on the site:
 * text: its words, as written; placeholder: a neutral marker instead;
 * hide: nothing when the words are only the note's name, an alias kept.
 */
export type PrivateLinks = "text" | "placeholder" | "hide"

/** The name of the note a link target points at: no folder, heading or extension. */
const nameOf = (target: string) => target.split("#")[0].split("/").pop()!.replace(/\.md$/i, "").trim()

/** Whether the words shown for a private link are its note's own name, which tells readers it exists. */
export function showsName(target: string, shown: string): boolean {
  return shown.trim().toLowerCase() === nameOf(target).toLowerCase()
}

/** The words a link to a private note leaves on the page; "" leaves nothing. */
export function privateLinkText(mode: PrivateLinks, target: string, alias: string | undefined, placeholder: string): string {
  if (mode === "placeholder") return placeholder
  if (mode === "hide") return alias && !showsName(target, alias) ? alias : ""
  return alias ?? nameOf(target)
}

/** An outside host the built site loads something from, and why. */
export interface Host {
  host: string
  why: string
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

/**
 * The outside hosts a site loads from: those its configuration turns on, and
 * those notes embed (`src="https://…"` in their rendered markdown).
 */
export function outsideHosts(
  config: {
    theme: { fonts: Record<string, string | undefined> }
    analytics?: { provider: string; host?: string; id?: string }
    comments?: { provider: string; host?: string }
    webmentions?: unknown
    subscribe?: { provider: string; action?: string }
    map: { tiles: string; darkTiles?: string }
    linkPreviews: boolean
  },
  monoFont: string,
  embedded: Iterable<string>,
  hasMap: boolean,
): Host[] {
  const hosts = new Map<string, string>()
  const add = (url: string | undefined, why: string) => {
    const host = url && hostOf(url.replace(/\{[a-z]\}/g, "a"))
    if (host && !hosts.has(host)) hosts.set(host, why)
  }
  add(monoFont, "monospace font of every page")
  if (Object.values(config.theme.fonts).some(Boolean)) {
    add("https://fonts.googleapis.com", "fonts named in theme.fonts")
    add("https://fonts.gstatic.com", "fonts named in theme.fonts")
  }
  const a = config.analytics
  if (a?.provider === "google") add("https://www.googletagmanager.com", "analytics")
  else if (a?.provider === "plausible") add(`https://${a.host ?? "plausible.io"}`, "analytics")
  else if (a?.provider === "umami") add(a.host, "analytics")
  else if (a?.provider === "goatcounter") add(`https://${a.id}.goatcounter.com`, "analytics")
  const c = config.comments
  if (c?.provider === "giscus") add("https://giscus.app", "comments")
  else if (c?.provider === "commento") add(c.host, "comments")
  if (config.webmentions) add("https://webmention.io", "webmentions")
  const sub = config.subscribe
  if (sub?.provider === "buttondown") add("https://buttondown.com", "subscribe form")
  else if (sub?.provider === "form") add(sub.action, "subscribe form")
  if (hasMap) {
    add(config.map.tiles, "map tiles")
    add(config.map.darkTiles, "map tiles")
  }
  for (const url of embedded) add(url, "embedded in a note")
  const out = [...hosts].map(([host, why]) => ({ host, why })).sort((x, y) => x.host.localeCompare(y.host))
  // Their hosts are only known once the cards are fetched.
  if (config.linkPreviews) out.push({ host: "(the linked sites)", why: "images of link preview cards" })
  return out
}
