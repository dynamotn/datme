/** Quartz-compatible slug of one path segment, so existing URLs keep working. */
export function sluggifySegment(s: string): string {
  return s
    .replace(/\s/g, "-")
    .replace(/&/g, "-and-")
    .replace(/%/g, "-percent")
    .replace(/\?/g, "")
    .replace(/#/g, "")
}

export function sluggify(p: string): string {
  return p
    .split("/")
    .filter(Boolean)
    .map(sluggifySegment)
    .join("/")
}

export function slugTag(tag: string): string {
  return tag
    .split("/")
    .map((s) => sluggifySegment(s.trim()))
    .join("/")
}

/** Turn a slug into an absolute URL path, encoding each segment. */
export function slugToUrl(slug: string): string {
  if (slug === "" || slug === "index") return "/"
  const clean = slug.replace(/\/?index$/, "")
  return "/" + clean.split("/").map(encodeURIComponent).join("/")
}

/** Human name of a vault folder: "06.01_Tools" -> "Tools". */
export function folderDisplayName(segment: string): string {
  return segment.replace(/^\d+(\.\d+)*[_\s-]+/, "") || segment
}
