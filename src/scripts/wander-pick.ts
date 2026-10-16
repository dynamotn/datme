import { samePath } from "./data"

/** A URL other than the current one, at random; undefined when there is no other. */
export function randomOther(urls: string[], current: string, random = Math.random): string | undefined {
  const others = urls.filter((u) => !samePath(u, current))
  return others.length ? others[Math.floor(random() * others.length)] : undefined
}

/** The URL after (or before) the current one; from a page outside the list, the first (or last). */
export function neighbour(urls: string[], current: string, by: 1 | -1): string | undefined {
  if (!urls.length) return undefined
  const i = urls.findIndex((u) => samePath(u, current))
  if (i < 0) return by > 0 ? urls[0] : urls.at(-1)
  return urls[i + by]
}
