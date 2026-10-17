import { site, type Lang } from "../site.config"
import { getVault, type Note, type FolderNode, type Doc, type Problem } from "./vault"
import { langPrefix } from "./i18n"
import { sluggify, slugToUrl, urlToSlug } from "./slug"
import { docSlug } from "./obsidian"
import { hasMap, hasTimeline } from "./places"
import { hasJournal } from "./journal"
import { BRIDGY_REDIRECTS } from "./activitypub"
import { hasDecks } from "./decks"
import { hasChanges } from "./changes"
import { hasHistory } from "./history"

export type Page =
  | { kind: "home"; lang: Lang }
  | { kind: "note"; lang: Lang; note: Note }
  | { kind: "folder"; lang: Lang; folder: FolderNode }
  | { kind: "tag"; lang: Lang; tag?: string }
  | { kind: "alias"; lang: Lang; note: Note }
  | { kind: "canvas"; lang: Lang; doc: Doc }
  | { kind: "base"; lang: Lang; doc: Doc }
  | { kind: "drawing"; lang: Lang; doc: Doc }
  | { kind: "archive"; lang: Lang }
  | { kind: "recent"; lang: Lang }
  | { kind: "timeline"; lang: Lang }
  | { kind: "map"; lang: Lang }
  | { kind: "stats"; lang: Lang }
  | { kind: "practice"; lang: Lang }
  | { kind: "changes"; lang: Lang }
  | { kind: "calendar"; lang: Lang }
  | { kind: "history"; lang: Lang; note: Note }

/** A page in words, and the vault file it comes from, for a report. */
function describePage(page: Page): { what: string; file?: string } {
  switch (page.kind) {
    case "note":
      return { what: `note ${page.note.key}.md`, file: page.note.key + ".md" }
    case "history":
      return { what: `the history of ${page.note.key}.md`, file: page.note.key + ".md" }
    case "alias":
      return { what: `a redirect to ${page.note.key}.md`, file: page.note.key + ".md" }
    case "folder":
      return { what: `the page of folder ${page.folder.dir}` }
    case "tag":
      return { what: page.tag ? `the page of tag ${page.tag}` : "the list of tags" }
    case "canvas":
    case "base":
    case "drawing":
      return { what: `${page.kind} ${page.doc.rel}`, file: page.doc.rel }
    default:
      return { what: `the ${page.kind} page` }
  }
}

/**
 * Every page of the site by slug, and the pages lost to another of the same
 * URL. First claim wins: notes, then folders, tags, the archive, canvases and
 * bases, and finally redirects from aliases and from the old URL of notes
 * with a permalink. Slugs differing only in case clash too: static hosts and
 * macOS or Windows disks take them for one path, so one page would silently
 * overwrite the other.
 */
function claimRoutes(): { pages: Map<string, Page>; problems: Problem[] } {
  const vault = getVault()
  const pages = new Map<string, Page>()
  const byLower = new Map<string, Page>()
  const problems: Problem[] = []
  const claim = (slug: string, page: Page) => {
    const key = slug.replace(/(^|\/)index$/, "")
    const winner = byLower.get(key.toLowerCase())
    if (!winner) {
      byLower.set(key.toLowerCase(), page)
      pages.set(key, page)
      return
    }
    // Two notes of one URL are reported by the vault; a note's own alias or old URL needs no redirect.
    if (winner.kind === "note" && page.kind === "note") return
    if ("note" in winner && "note" in page && winner.note === page.note) return
    const [lost, kept] = [describePage(page), describePage(winner)]
    problems.push({
      level: "warning",
      file: lost.file ?? kept.file ?? "datme.yaml",
      message: `${lost.what} is not published: ${kept.what} has the same URL ${slugToUrl(key)}, regardless of case`,
    })
  }
  for (const lang of site.langs) {
    const prefix = langPrefix(lang)
    claim(prefix + "index", { kind: "home", lang })
    for (const note of vault.notes[lang]) if (!note.isHome) claim(note.slug, { kind: "note", lang, note })
    for (const folder of vault.folders[lang].values()) {
      if (folder.dir) claim(prefix + sluggify(folder.dir), { kind: "folder", lang, folder })
    }
    claim(prefix + "tags", { kind: "tag", lang })
    claim(prefix + "archive", { kind: "archive", lang })
    claim(prefix + "recent", { kind: "recent", lang })
    claim(prefix + "stats", { kind: "stats", lang })
    // Only when some note has a date or a place to show.
    if (hasTimeline(lang)) claim(prefix + "timeline", { kind: "timeline", lang })
    if (hasMap(lang)) claim(prefix + "map", { kind: "map", lang })
    if (hasJournal(lang)) claim(prefix + "calendar", { kind: "calendar", lang })
    if (hasDecks(lang)) claim(prefix + "practice", { kind: "practice", lang })
    if (hasChanges(lang)) claim(prefix + "changes", { kind: "changes", lang })
    for (const tag of vault.tags[lang].keys()) claim(prefix + "tags/" + tag, { kind: "tag", lang, tag })
    if (site.history) {
      for (const note of vault.notes[lang]) if (!note.isHome && hasHistory(note)) claim(note.slug + "/history", { kind: "history", lang, note })
    }
    for (const doc of vault.docs.values()) claim(prefix + docSlug(doc.rel), { kind: doc.kind, lang, doc })
    for (const note of vault.notes[lang]) {
      if (note.formerUrl) {
        claim(urlToSlug(note.formerUrl), { kind: "alias", lang, note })
      }
      for (const alias of note.aliases) {
        claim(prefix + sluggify(note.dir ? `${note.dir}/${alias}` : alias), { kind: "alias", lang, note })
      }
    }
  }
  return { pages, problems }
}

/** Every page of the site by slug; see claimRoutes for which page keeps a contested URL. */
export function routes(): Map<string, Page> {
  return claimRoutes().pages
}

/** Pages lost to another page of the same URL, reported by `datme check`. */
export function routeProblems(): Problem[] {
  return claimRoutes().problems
}

/** Permanent redirects, as lines of a Netlify / Cloudflare Pages `_redirects` file. */
export function redirectsFile(): string {
  const lines: string[] = []
  for (const [slug, page] of routes()) {
    if (page.kind === "alias") lines.push(`${slugToUrl(slug)} ${page.note.url} 301`)
  }
  if (site.activitypub === "bridgy") lines.push(...BRIDGY_REDIRECTS)
  return lines.join("\n") + (lines.length ? "\n" : "")
}
