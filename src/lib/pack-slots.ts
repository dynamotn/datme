import { site, type Lang, type StyleName } from "../site.config"
import type { Note } from "./vault"
import { renderTemplate, type Fields, type Slot } from "./pack-template"
import { formatDate, langPrefix, t } from "./i18n"
import { slugToUrl } from "./slug"
import { typeInfo } from "./types"

/**
 * Where the templates of the theme pack meet the site: the template a slot takes on a page, and
 * the fields it is given, which are what datme's own component shows there and nothing more.
 */

/** A slot drawn by the theme pack on a page in `style`, else nothing: the style's own template beats the pack's. */
export function drawSlot(slot: Slot, style: StyleName, lang: Lang, fields: Fields = {}): string | undefined {
  const nodes = site.pack?.styles[style]?.templates?.[slot] ?? site.pack?.templates?.[slot]
  if (!nodes) return undefined
  const home = slugToUrl(langPrefix(lang) + "index")
  return renderTemplate(nodes, { siteTitle: site.title[lang], home, lang, ...fields })
}

/** What a note shows where a template draws it. */
export interface Shown {
  title: string
  date?: Date
  /** Its description, as the default card shows it; a protected note never has one. */
  excerpt?: string
  /** Its banner, where the default component shows it. */
  cover?: string
  words: number
  tags: string[]
  featured?: boolean
}

/** The fields of a note for a card or its footer; the text of a protected note stays out. */
export function noteFields(note: Note, shown: Shown): Fields {
  const stage = note.stage ? site.stages[note.stage] : undefined
  const kind = note.types[0] ? typeInfo(note.types[0], note.lang) : undefined
  const prefix = site.conventions.typePrefix
  return {
    title: shown.title,
    url: note.url,
    excerpt: note.protected ? "" : (shown.excerpt ?? ""),
    date: formatDate(shown.date, note.lang),
    datetime: shown.date?.toISOString() ?? "",
    cover: shown.cover ?? "",
    stage: stage?.label[note.lang] ?? "",
    stageIcon: stage?.icon ?? "",
    type: kind?.label ?? "",
    typeIcon: kind?.icon ?? "",
    readingTime: t(note.lang).readingTime(Math.max(1, Math.round(shown.words / 220))),
    locked: note.protected,
    featured: !!shown.featured,
    author: site.author,
    tags: shown.tags.map((tag) => ({
      name: tag.startsWith(prefix) ? typeInfo(tag.slice(prefix.length), note.lang).label : tag,
      url: slugToUrl(langPrefix(note.lang) + "tags/" + tag),
    })),
  }
}
