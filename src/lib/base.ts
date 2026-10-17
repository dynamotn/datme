/**
 * The path a site is served under: "/" at the root of its host, "/garden/"
 * for https://x.dev/garden/ (GitHub and GitLab project Pages). Every URL path
 * datme writes into a page, a feed or a header goes through here, so a site
 * under a path links to itself there.
 *
 * A leaf module: slug.ts needs it and site.config.ts needs slug.ts, so the
 * site config hands its values over with useSite instead of being imported.
 */

interface BaseSite {
  /** The public address, without its trailing slash. */
  url?: string
  /** Its path, as basePath gives it. */
  base: string
}

let current: BaseSite = { base: "/" }

/** The site whose base the helpers use; site.config.ts passes the loaded config. */
export function useSite(site: BaseSite): void {
  current = site
}

/** The path of a site URL, "/" or "/garden/": always with a slash at both ends. */
export function basePath(url: string | undefined): string {
  const path = url ? new URL(url).pathname.replace(/\/+$/, "") : ""
  return path + "/"
}

/**
 * A path from the root of the site ("/static/x.json", "/") as a link on the
 * site. Anything else (a relative path, //host or https:// URL) is left as is.
 */
export function withBase(path: string, base = current.base): string {
  return base === "/" || !path.startsWith("/") || path.startsWith("//") ? path : base + path.slice(1)
}

/** A link on the site as the path from its root: the inverse of withBase. */
export function stripBase(href: string, base = current.base): string {
  if (base === "/") return href
  if (href.startsWith(base)) return "/" + href.slice(base.length)
  return href === base.slice(0, -1) ? "/" : href
}

/** A link on the site (already under its base) as an absolute URL; unchanged without site.url. */
export function absUrl(href: string, site: { url?: string } = current): string {
  return site.url ? new URL(href, site.url + "/").href : href
}
