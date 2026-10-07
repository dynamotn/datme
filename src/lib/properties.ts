import { site } from "../site.config"
import { getVault, type Note } from "./vault"
import { GLOBAL as MARP_DIRECTIVES } from "./slides"

export type PropValue =
  | { kind: "text"; text: string; href?: string }
  | { kind: "list"; items: PropValue[] }
  | { kind: "map"; entries: [string, PropValue][] }

/** Keys shown elsewhere on the page or meaningful only inside Obsidian. */
export const HIDDEN_PROPERTIES = [
  "title",
  "lang",
  "permalink",
  "tags",
  "tag",
  "alias",
  "publish",
  "draft",
  "unlisted",
  "password",
  "description",
  "created",
  "updated",
  "modified",
  "lastmod",
  "date",
  "banner",
  "banner_x",
  "banner_y",
  "cssclasses",
  "cssclass",
  "series",
  "kanban-plugin",
  "publish_date",
  "publishDate",
  "series_order",
  "seriesOrder",
  "uid",
  "id",
  "template",
  "enableToc",
  "AutoNoteMover",
  "sticker",
  "excalidraw-plugin",
  "icon",
  "iconColor",
  "history",
]

const WIKILINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/

/** A frontmatter value made displayable; undefined when it is empty. */
export function toProp(v: unknown, resolve: (target: string) => Note | undefined): PropValue | undefined {
  if (v == null || v === "") return undefined
  if (Array.isArray(v)) {
    const items = v.map((x) => toProp(x, resolve)).filter((x): x is PropValue => x !== undefined)
    return items.length ? { kind: "list", items } : undefined
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => [k, toProp(x, resolve)] as const)
      .filter((e): e is [string, PropValue] => e[1] !== undefined)
    return entries.length ? { kind: "map", entries } : undefined
  }
  const text = String(v).trim()
  if (!text) return undefined
  const link = text.match(WIKILINK)
  if (link) {
    const note = resolve(link[1])
    return { kind: "text", text: link[2] ?? note?.title ?? link[1], href: note?.url }
  }
  if (/^(https?:\/\/|mailto:)/.test(text)) return { kind: "text", text: text.replace(/^mailto:/, ""), href: text }
  return { kind: "text", text }
}

/** The properties block of a note: aliases first, then every other non-hidden key. */
export function noteProperties(note: Note): [string, PropValue][] {
  if (note.protected) return []
  const vault = getVault()
  // A deck's directives style its slides; they say nothing to a reader.
  const directives = note.slides ? ["marp", ...MARP_DIRECTIVES] : []
  const hidden = new Set([...HIDDEN_PROPERTIES, ...directives, ...site.properties.hide].map((k) => k.toLowerCase()))
  const resolve = (target: string) => {
    const s = vault.resolveNote(target, note.dir)
    return s && vault.byKey[note.lang].get(s.key)
  }
  const out: [string, PropValue][] = []
  for (const [key, value] of Object.entries(note.source.fm)) {
    if (hidden.has(key.toLowerCase())) continue
    const prop = toProp(value, resolve)
    if (prop) out.push([key === "aliases" ? "aliases" : key, prop])
  }
  return out.sort(([a], [b]) => (a === "aliases" ? -1 : b === "aliases" ? 1 : 0))
}
