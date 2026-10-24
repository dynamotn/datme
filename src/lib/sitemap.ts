import fs from "node:fs"
import path from "node:path"
import { stripBase } from "./base"

/**
 * Whether the sitemap lists a built page: pages kept out of search engines (unlisted and
 * draft notes, alias redirects, history) stay out of it. So does a page that cannot be
 * read, with a warning: it could be one of those, and a sitemap must not list it then.
 */
export function indexable(page: string, outDir: string): boolean {
  try {
    const file = path.join(outDir, decodeURIComponent(stripBase(new URL(page).pathname)), "index.html")
    return !fs.readFileSync(file, "utf8").includes('<meta name="robots" content="noindex"')
  } catch (e) {
    const why = (e as NodeJS.ErrnoException).code ?? (e as Error).message
    console.warn(`[datme] ${page} is left out of the sitemap: its page cannot be read (${why})`)
    return false
  }
}
