/**
 * The path the site is served under, in the browser: "/", or "/garden/" for a
 * site at https://x.dev/garden/. Astro writes it into the bundle as BASE_URL.
 * Links in pages already carry it; files the scripts fetch by name need it.
 */
export function base(): string {
  const b = import.meta.env.BASE_URL || "/"
  return b.endsWith("/") ? b : b + "/"
}

/** A path from the root of the site ("/static/x.json") as its path on the host. */
export const withBase = (path: string) => base() + path.replace(/^\/+/, "")
