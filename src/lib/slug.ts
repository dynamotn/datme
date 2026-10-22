import { stripBase, withBase } from "./base"

/**
 * Quartz-compatible slug of one path segment, so existing URLs keep working.
 * Composed Unicode (NFC), so a name macOS stored decomposed gets the same URL.
 */
export function sluggifySegment(s: string): string {
  const slug = s.normalize("NFC").replace(/\s/g, "-").replace(/&/g, "-and-").replace(/%/g, "-percent").replace(/\?/g, "").replace(/#/g, "")
  // "." and ".." would name a folder above the page, not a page.
  return slug === "." || slug === ".." ? "" : slug
}

export function sluggify(p: string): string {
  return p.split("/").map(sluggifySegment).filter(Boolean).join("/")
}

export function slugTag(tag: string): string {
  return tag
    .split("/")
    .map((s) => sluggifySegment(s.trim()))
    .filter(Boolean)
    .join("/")
}

/** Turn a slug into the URL path of its page, under the site's base, encoding each segment. */
export function slugToUrl(slug: string): string {
  if (slug === "" || slug === "index") return withBase("/")
  const clean = slug.replace(/(^|\/)index$/, "")
  return withBase("/" + clean.split("/").map(encodeURIComponent).join("/"))
}

/** The slug of a page from its URL path: the inverse of slugToUrl, for route params. */
export function urlToSlug(url: string): string {
  return stripBase(url).replace(/^\//, "").split("/").map(decodeURIComponent).join("/")
}

/** Human name of a vault folder: "06.01_Tools" -> "Tools". */
export function folderDisplayName(segment: string): string {
  return segment.replace(/^\d+(\.\d+)*[_\s-]+/, "") || segment
}
