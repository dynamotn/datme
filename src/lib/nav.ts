import { site, type Lang, type NavItem } from "../site.config"
import { getVault } from "./vault"
import { t, langPrefix } from "./i18n"
import { slugToUrl } from "./slug"
import { withBase } from "./base"
import { hasMap, hasTimeline } from "./places"
import { hasJournal } from "./journal"
import { hasDecks } from "./decks"
import { hasChanges } from "./changes"

export interface NavLink {
  label: string
  url: string
}

const warned = new Set<string>()

/** The main menu of a language, with note targets resolved like wikilinks. */
export function navLinks(lang: Lang): NavLink[] {
  return resolveLinks(lang, site.nav, "nav")
}

/** The shortcuts at the top of the left sidebar, resolved like the main menu. */
export function sidebarLinks(lang: Lang): NavLink[] {
  return resolveLinks(lang, site.sidebar, "sidebar")
}

/** The footer's columns of links, resolved like the main menu; a column left empty is dropped. */
export function footerColumns(lang: Lang): { title?: string; links: NavLink[] }[] {
  return site.footer
    .map((g) => ({ title: g.title, links: resolveLinks(lang, g.items, "footer") }))
    .filter((g) => g.links.length)
}

function resolveLinks(lang: Lang, items: NavItem[], list: "nav" | "sidebar" | "footer"): NavLink[] {
  const vault = getVault()
  const out: NavLink[] = []
  for (const item of items) {
    if (item.kind === "home") out.push({ label: t(lang).home, url: slugToUrl(langPrefix(lang) + "index") })
    else if (item.kind === "tags") out.push({ label: t(lang).tags, url: slugToUrl(langPrefix(lang) + "tags") })
    else if (item.kind === "archive") out.push({ label: t(lang).archive, url: slugToUrl(langPrefix(lang) + "archive") })
    else if (item.kind === "recent") out.push({ label: t(lang).recentChanges, url: slugToUrl(langPrefix(lang) + "recent") })
    else if (item.kind === "stats") out.push({ label: t(lang).stats, url: slugToUrl(langPrefix(lang) + "stats") })
    // These pages only exist when some note has a date or a place to show.
    else if (item.kind === "timeline") {
      if (hasTimeline(lang)) out.push({ label: t(lang).timeline, url: slugToUrl(langPrefix(lang) + "timeline") })
    } else if (item.kind === "map") {
      if (hasMap(lang)) out.push({ label: t(lang).map, url: slugToUrl(langPrefix(lang) + "map") })
    } else if (item.kind === "calendar") {
      if (hasJournal(lang)) out.push({ label: t(lang).calendar, url: slugToUrl(langPrefix(lang) + "calendar") })
    } else if (item.kind === "changes") {
      if (hasChanges(lang)) out.push({ label: t(lang).changes, url: slugToUrl(langPrefix(lang) + "changes") })
    } else if (item.kind === "practice") {
      if (hasDecks(lang)) out.push({ label: t(lang).practice, url: slugToUrl(langPrefix(lang) + "practice") })
    }
    else if (item.kind === "url") out.push({ label: item.label![lang], url: withBase(item.target!) })
    else {
      const source = vault.resolveNote(item.target!, "")
      const note = source && vault.byKey[lang].get(source.key)
      if (!note) {
        if (!warned.has(item.target!)) console.warn(`[datme] ${list}: no published note matches "${item.target}"`)
        warned.add(item.target!)
        continue
      }
      out.push({ label: item.label?.[lang] ?? note.title, url: note.url })
    }
  }
  return out
}

/** Whether a folder's page shows its notes in full, as a stream of short notes. */
export function isStream(dir: string): boolean {
  return site.appearance.stream.some((f) => dir === f || dir.startsWith(f + "/"))
}
