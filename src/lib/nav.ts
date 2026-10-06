import { site, type Lang } from "../site.config"
import { getVault, type Note } from "./vault"
import { t, langPrefix } from "./i18n"
import { slugToUrl } from "./slug"

export interface NavLink {
  label: string
  url: string
}

const warned = new Set<string>()

/** The main menu of a language, with note targets resolved like wikilinks. */
export function navLinks(lang: Lang): NavLink[] {
  const vault = getVault()
  const out: NavLink[] = []
  for (const item of site.nav) {
    if (item.kind === "home") out.push({ label: t(lang).home, url: slugToUrl(langPrefix(lang) + "index") })
    else if (item.kind === "tags") out.push({ label: t(lang).tags, url: slugToUrl(langPrefix(lang) + "tags") })
    else if (item.kind === "archive") out.push({ label: t(lang).archive, url: slugToUrl(langPrefix(lang) + "archive") })
    else if (item.kind === "recent") out.push({ label: t(lang).recentChanges, url: slugToUrl(langPrefix(lang) + "recent") })
    else if (item.kind === "url") out.push({ label: item.label![lang], url: item.target! })
    else {
      const source = vault.resolveNote(item.target!, "")
      const note = source && vault.byKey[lang].get(source.key)
      if (!note) {
        if (!warned.has(item.target!)) console.warn(`[datme] nav: no published note matches "${item.target}"`)
        warned.add(item.target!)
        continue
      }
      out.push({ label: item.label?.[lang] ?? note.title, url: note.url })
    }
  }
  return out
}

/** Page style of a note: the site default, flipped for folders listed in appearance.classic. */
export function lookOf(note: Pick<Note, "dir"> | undefined): "notebook" | "classic" {
  const { style, classic } = site.appearance
  if (!note) return style
  const flipped = classic.some((f) => note.dir === f || note.dir.startsWith(f + "/"))
  return flipped ? (style === "notebook" ? "classic" : "notebook") : style
}
