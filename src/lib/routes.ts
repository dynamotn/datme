import { site, type Lang } from "../site.config"
import { getVault, type Note, type FolderNode, type Doc } from "./vault"
import { langPrefix } from "./i18n"
import { sluggify, slugToUrl } from "./slug"
import { hasMap, hasTimeline } from "./places"

export type Page =
  | { kind: "home"; lang: Lang }
  | { kind: "note"; lang: Lang; note: Note }
  | { kind: "folder"; lang: Lang; folder: FolderNode }
  | { kind: "tag"; lang: Lang; tag?: string }
  | { kind: "alias"; lang: Lang; note: Note }
  | { kind: "canvas"; lang: Lang; doc: Doc }
  | { kind: "base"; lang: Lang; doc: Doc }
  | { kind: "archive"; lang: Lang }
  | { kind: "recent"; lang: Lang }
  | { kind: "timeline"; lang: Lang }
  | { kind: "map"; lang: Lang }

/**
 * Every page of the site by slug. First claim wins: notes, then folders, tags,
 * the archive, canvases and bases, and finally redirects from aliases and
 * from the old URL of notes with a permalink.
 */
export function routes(): Map<string, Page> {
  const vault = getVault()
  const pages = new Map<string, Page>()
  const claim = (slug: string, page: Page) => {
    const key = slug.replace(/\/?index$/, "")
    if (!pages.has(key)) pages.set(key, page)
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
    // Only when some note has a date or a place to show.
    if (hasTimeline(lang)) claim(prefix + "timeline", { kind: "timeline", lang })
    if (hasMap(lang)) claim(prefix + "map", { kind: "map", lang })
    for (const tag of vault.tags[lang].keys()) claim(prefix + "tags/" + tag, { kind: "tag", lang, tag })
    for (const doc of vault.docs.values()) claim(prefix + sluggify(doc.rel), { kind: doc.kind, lang, doc })
    for (const note of vault.notes[lang]) {
      if (note.formerUrl) {
        claim(note.formerUrl.replace(/^\//, "").split("/").map(decodeURIComponent).join("/"), { kind: "alias", lang, note })
      }
      for (const alias of note.aliases) {
        claim(prefix + sluggify(note.dir ? `${note.dir}/${alias}` : alias), { kind: "alias", lang, note })
      }
    }
  }
  return pages
}

/** Permanent redirects, as lines of a Netlify / Cloudflare Pages `_redirects` file. */
export function redirectsFile(): string {
  const lines: string[] = []
  for (const [slug, page] of routes()) {
    if (page.kind === "alias") lines.push(`${slugToUrl(slug)} ${page.note.url} 301`)
  }
  return lines.join("\n") + (lines.length ? "\n" : "")
}
