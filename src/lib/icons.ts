/**
 * Icons of the Iconize plugin: folders and notes keep the icon given in
 * Obsidian. Iconize stores them in its data.json, by path, or in a note's
 * `icon` frontmatter; an icon is an emoji, a Lucide name like `LiBookOpen`, or
 * a name from an icon pack Iconize downloaded into `.obsidian/icons`.
 */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { site } from "../site.config"

const DATA = ".obsidian/plugins/obsidian-icon-folder/data.json"
const PACKS = ".obsidian/icons"

let byPath: { stamp: string; map: Map<string, { name: string; color?: string }> } | undefined
const svgs = new Map<string, string | undefined>()

/** Icons Iconize keeps by path: "Books" for a folder, "Books/Dune.md" for a note. */
export function iconizeIcons(vault = site.vault): Map<string, { name: string; color?: string }> {
  // Read again when Iconize saves, so `datme dev` follows icon changes.
  let stamp = vault
  try {
    stamp += fs.statSync(path.join(vault, DATA)).mtimeMs
  } catch {
    stamp += "-"
  }
  if (byPath?.stamp === stamp) return byPath.map
  const map = new Map<string, { name: string; color?: string }>()
  try {
    const data = JSON.parse(fs.readFileSync(path.join(vault, DATA), "utf8")) as Record<string, unknown>
    for (const [key, value] of Object.entries(data)) {
      if (key === "settings") continue
      if (typeof value === "string" && value) map.set(key, { name: value })
      else if (value && typeof value === "object" && typeof (value as { iconName?: unknown }).iconName === "string") {
        const v = value as { iconName: string; iconColor?: string }
        map.set(key, { name: v.iconName, color: v.iconColor })
      }
    }
  } catch {
    // no Iconize in this vault
  }
  byPath = { stamp, map }
  return map
}

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase()

/** The SVG of an icon name, from Lucide or a downloaded pack; undefined when unknown. */
function svgOf(name: string, vault: string): string | undefined {
  const id = `${vault}\0${name}`
  if (svgs.has(id)) return svgs.get(id)
  let svg: string | undefined
  const m = name.match(/^([A-Z][a-z])([A-Z0-9].*)$/)
  if (m) {
    const [, prefix, rest] = m
    if (prefix === "Li") {
      try {
        const lucide = path.dirname(createRequire(import.meta.url).resolve("lucide-static/package.json"))
        svg = fs.readFileSync(path.join(lucide, "icons", `${kebab(rest)}.svg`), "utf8")
      } catch {
        // not a Lucide icon
      }
    } else {
      try {
        for (const pack of fs.readdirSync(path.join(vault, PACKS))) {
          const file = path.join(vault, PACKS, pack, `${rest}.svg`)
          if (fs.existsSync(file)) {
            svg = fs.readFileSync(file, "utf8")
            break
          }
        }
      } catch {
        // no downloaded packs
      }
    }
  }
  // Sized to the text around it; licence comments and fixed sizes go.
  svg = svg
    ?.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s(width|height|class)="[^"]*"/g, "")
    .replace(/<svg\b/, '<svg width="1em" height="1em" aria-hidden="true" focusable="false"')
    .replace(/\s+/g, " ")
    .trim()
  svgs.set(id, svg)
  return svg
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")

/** The HTML of an icon: an emoji, or an inline SVG; undefined when there is none to show. */
export function iconHtml(name: string | undefined, color?: string, vault = site.vault): string | undefined {
  if (!name) return undefined
  const style = color && /^[#\w(),.\s%-]+$/.test(color) ? ` style="color:${escape(color)}"` : ""
  if (/^[A-Z][a-z][A-Z0-9]/.test(name)) {
    const svg = svgOf(name, vault)
    return svg ? `<span class="iconize"${style}>${svg}</span>` : undefined
  }
  // Anything else Iconize stores is an emoji.
  return `<span class="iconize" aria-hidden="true"${style}>${escape(name)}</span>`
}

/** The icon of a folder, by its vault-relative path. */
export function folderIcon(dir: string): string | undefined {
  const icon = iconizeIcons().get(dir)
  return iconHtml(icon?.name, icon?.color)
}

/** The icon of a note: its `icon` frontmatter first, then Iconize's data. */
export function noteIcon(key: string, fm: Record<string, unknown>): string | undefined {
  if (typeof fm.icon === "string" && fm.icon) return iconHtml(fm.icon, typeof fm.iconColor === "string" ? fm.iconColor : undefined)
  const icon = iconizeIcons().get(`${key}.md`)
  return iconHtml(icon?.name, icon?.color)
}
