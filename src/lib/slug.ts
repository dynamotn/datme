/**
 * Quartz-compatible slug of one path segment, so existing URLs keep working.
 * Composed Unicode (NFC), so a name macOS stored decomposed gets the same URL.
 */
export function sluggifySegment(s: string): string {
  const slug = s
    .normalize("NFC")
    .replace(/\s/g, "-")
    .replace(/&/g, "-and-")
    .replace(/%/g, "-percent")
    .replace(/\?/g, "")
    .replace(/#/g, "")
  // "." and ".." would name a folder above the page, not a page.
  return slug === "." || slug === ".." ? "" : slug
}

export function sluggify(p: string): string {
  return p
    .split("/")
    .map(sluggifySegment)
    .filter(Boolean)
    .join("/")
}

export function slugTag(tag: string): string {
  return tag
    .split("/")
    .map((s) => sluggifySegment(s.trim()))
    .filter(Boolean)
    .join("/")
}

/** Turn a slug into an absolute URL path, encoding each segment. */
export function slugToUrl(slug: string): string {
  if (slug === "" || slug === "index") return "/"
  const clean = slug.replace(/(^|\/)index$/, "")
  return "/" + clean.split("/").map(encodeURIComponent).join("/")
}

/** Human name of a vault folder: "06.01_Tools" -> "Tools". */
export function folderDisplayName(segment: string): string {
  return segment.replace(/^\d+(\.\d+)*[_\s-]+/, "") || segment
}
