import { BRAND_ICONS, type Brand } from "./brand-icons"

/** Hosts of the profiles the footer draws as logos; a subdomain counts as its host. */
const HOSTS: Record<string, Brand> = {
  "bilibili.com": "bilibili",
  "bsky.app": "bluesky",
  "codeberg.org": "codeberg",
  "dev.to": "devdotto",
  "discord.com": "discord",
  "discord.gg": "discord",
  "facebook.com": "facebook",
  "flickr.com": "flickr",
  "github.com": "github",
  "gitlab.com": "gitlab",
  "goodreads.com": "goodreads",
  "scholar.google.com": "googlescholar",
  "instagram.com": "instagram",
  "ko-fi.com": "kofi",
  "letterboxd.com": "letterboxd",
  "linkedin.com": "linkedin",
  "medium.com": "medium",
  "orcid.org": "orcid",
  "patreon.com": "patreon",
  "reddit.com": "reddit",
  "researchgate.net": "researchgate",
  "soundcloud.com": "soundcloud",
  "open.spotify.com": "spotify",
  "stackoverflow.com": "stackoverflow",
  "substack.com": "substack",
  "t.me": "telegram",
  "threads.com": "threads",
  "threads.net": "threads",
  "tiktok.com": "tiktok",
  "twitch.tv": "twitch",
  "twitter.com": "x",
  "x.com": "x",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "zalo.me": "zalo",
}

export interface Profile {
  href: string
  /** Name of the service, for the link's label. */
  title: string
  /** The logo's path on a 24×24 box; none for a site without a known logo. */
  path?: string
}

/**
 * A profile link as the footer draws it. Mastodon servers have no common host, so a
 * profile there is told by its /@user path, or by the host of the site's fediverse handle.
 */
export function profileOf(href: string, fediverse?: string): Profile {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { href, title: href }
  }
  const host = url.hostname.replace(/^www\./, "")
  const known = Object.keys(HOSTS).find((h) => host === h || host.endsWith("." + h))
  const fediHost = fediverse?.split("@")[2]
  const brand: Brand | undefined = known ? HOSTS[known] : host === fediHost || /^\/@[^/]+\/?$/.test(url.pathname) ? "mastodon" : undefined
  return brand ? { href, title: BRAND_ICONS[brand].title, path: BRAND_ICONS[brand].path } : { href, title: host }
}

/** The site's name as the footer's mark: a name written like a domain keeps its ending for the accent. */
export function brandParts(title: string): [string, string] {
  const dot = title.lastIndexOf(".")
  return /^\S+$/.test(title) && dot > 0 && dot < title.length - 1 ? [title.slice(0, dot), title.slice(dot)] : [title, ""]
}
