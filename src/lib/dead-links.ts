import fs from "node:fs"
import path from "node:path"

/**
 * Links that `datme check --external` found dead, kept in the build cache so
 * the next builds can point them at the Internet Archive instead.
 */
export const DEAD_LINKS_FILE = "dead-links.json"

/** Older findings are not trusted: a site may have come back. */
const MAX_AGE = 30 * 86_400_000

interface Stored {
  checkedAt: number
  urls: string[]
}

export function writeDeadLinks(dir: string, urls: string[], now = Date.now()): void {
  fs.mkdirSync(dir, { recursive: true })
  const data: Stored = { checkedAt: now, urls: [...new Set(urls)].sort() }
  fs.writeFileSync(path.join(dir, DEAD_LINKS_FILE), JSON.stringify(data, null, 2) + "\n")
}

function read(dir: string | undefined, now: number): Stored | undefined {
  if (!dir) return undefined
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, DEAD_LINKS_FILE), "utf8")) as Stored
    return now - data.checkedAt <= MAX_AGE ? data : undefined
  } catch {
    return undefined
  }
}

/** Dead URLs of the last check, if it is recent enough. */
export function readDeadLinks(dir = process.env.DATME_CACHE, now = Date.now()): Set<string> {
  return new Set(read(dir, now)?.urls ?? [])
}

/** When the dead links were checked, to key cached pages that point at them. */
export function deadLinksStamp(dir = process.env.DATME_CACHE, now = Date.now()): string {
  return String(read(dir, now)?.checkedAt ?? "")
}

/** The Internet Archive's latest copy of a page. */
export const archiveUrl = (url: string) => `https://web.archive.org/web/${url}`
