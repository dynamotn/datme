import fs from "node:fs"
import path from "node:path"
import { parseYaml } from "./yaml"
import { PACKAGE_ROOT } from "./package-root"

/**
 * Theme packs: a reusable look in a folder holding a theme.yaml, its stylesheets, fonts and
 * pictures. `theme.preset` names one: a folder of the vault, `.datme/themes/<name>` in it, or an
 * installed `datme-theme-<name>` package. A pack only ever ships CSS and files that CSS loads:
 * no script of a pack runs, and no file outside its folder is read or published.
 */

/** Files a pack publishes, by extension: stylesheets, fonts and pictures; SVG could carry scripts. */
export const PACK_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
}

/** The keys of theme.yaml that set `theme:` values of datme.yaml. */
export const PACK_THEME_KEYS = ["scheme", "accent", "fonts", "code", "comments", "mermaid", "d2"] as const
const OTHER_KEYS = ["name", "description", "style", "css", "styles"]

/** A style a pack adds: a built-in style to build on, and stylesheets loaded on its pages after that one's. */
export interface PackStyle {
  base: string
  css: string[]
}

export interface ThemePack {
  /** The preset as datme.yaml names it. */
  preset: string
  /** The pack's folder. */
  dir: string
  /** Where its warnings point: theme.yaml from the vault's root, or datme.yaml for a package. */
  file: string
  /** `theme:` values of theme.yaml, checked by the config as its own. */
  theme: Record<string, unknown>
  /** The site style the pack is made for. */
  style?: unknown
  /** Stylesheets loaded on every page, from the pack's folder. */
  css: string[]
  styles: Record<string, PackStyle>
  /** Font families its stylesheets declare with @font-face: never fetched from Google Fonts. */
  fonts: string[]
}

const NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i
/** Names of the styles a pack adds: they end up in attributes, addresses and datme.yaml. */
export const PACK_STYLE_NAME = /^[a-z][a-z0-9-]*$/

/** Whether a preset names a folder rather than a package. */
const isPath = (preset: string) => /^[./]/.test(preset) || (preset.includes("/") && !preset.startsWith("@"))
/** The package a preset names: `ink` is datme-theme-ink; a scoped or full name is itself. */
const packageOf = (preset: string) => (preset.startsWith("@") || preset.startsWith("datme-theme-") ? preset : `datme-theme-${preset}`)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** Whether `file` lies inside `dir`, symbolic links followed. */
function inside(dir: string, file: string): boolean {
  const rel = path.relative(fs.realpathSync(dir), fs.realpathSync(file))
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel)
}

/** Folders a preset may name, in the order they are tried; a path must stay in the vault. */
export function packCandidates(preset: string, vault: string, roots: string[] = [vault, PACKAGE_ROOT]): string[] | string {
  if (isPath(preset)) {
    const dir = path.resolve(vault, preset)
    const rel = path.relative(vault, dir)
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return `theme.preset: ${preset} is outside the vault; install the theme as a package instead`
    return [dir]
  }
  if (!NAME.test(preset)) return `theme.preset: "${preset}" is neither a folder of the vault nor a package name`
  const dirs = preset.startsWith("@") ? [] : [path.join(vault, ".datme", "themes", preset)]
  for (const root of roots) {
    for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
      dirs.push(path.join(dir, "node_modules", packageOf(preset)))
      if (path.dirname(dir) === dir) break
    }
  }
  return [...new Set(dirs)]
}

/** A file a pack names, from its folder; a reason when it is outside, missing or of another kind. */
function packFile(dir: string, rel: unknown, ext: string): { file?: string; problem?: string } {
  if (typeof rel !== "string" || !rel.trim()) return { problem: `${JSON.stringify(rel)} is not a file name` }
  const file = path.resolve(dir, rel)
  if (path.extname(file).toLowerCase() !== ext) return { problem: `${rel} is not a ${ext} file` }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { problem: `${rel} is not in the theme` }
  if (!inside(dir, file)) return { problem: `${rel} is outside the theme's folder` }
  return { file: path.relative(dir, fs.realpathSync(file)).split(path.sep).join("/") }
}

/** Families of the @font-face rules of some CSS. */
export function fontFaces(css: string): string[] {
  return [...css.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*(["']?)([^;"'}]+)\1/g)].map((m) => m[2].trim())
}

/** Finds and reads the pack a preset names; what is wrong with it comes back as warnings. */
export function loadPack(preset: string, vault: string, roots?: string[]): { pack?: ThemePack; warnings: string[] } {
  const candidates = packCandidates(preset, vault, roots)
  if (typeof candidates === "string") return { warnings: [candidates] }
  const dir = candidates.find((d) => fs.existsSync(path.join(d, "theme.yaml")))
  if (!dir) {
    const where = isPath(preset) ? preset : `${preset.startsWith("@") ? "" : `.datme/themes/${preset} or `}a ${packageOf(preset)} package`
    return { warnings: [`theme.preset: no theme.yaml in ${where}, so the site keeps its own theme`] }
  }
  const rel = path.relative(vault, path.join(dir, "theme.yaml"))
  const file = rel.startsWith("..") ? "datme.yaml" : rel.split(path.sep).join("/")
  const label = `theme ${preset}`
  let raw: unknown
  try {
    raw = parseYaml(fs.readFileSync(path.join(dir, "theme.yaml"), "utf8"), { json: true }) ?? {}
  } catch (e) {
    return { warnings: [`${label}: theme.yaml is not valid YAML, so the site keeps its own theme: ${(e as Error).message.split("\n")[0]}`] }
  }
  if (!isObject(raw)) return { warnings: [`${label}: theme.yaml holds no settings, so the site keeps its own theme`] }
  const warnings: string[] = []
  const sheets = (value: unknown, where: string): string[] =>
    (Array.isArray(value) ? value : value == null ? [] : [value]).flatMap((v) => {
      const { file, problem } = packFile(dir, v, ".css")
      if (problem) warnings.push(`${label}: ${where}: ${problem}, so it is left out`)
      return file ? [file] : []
    })
  const theme: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if ((PACK_THEME_KEYS as readonly string[]).includes(key)) theme[key] = value
    else if (!OTHER_KEYS.includes(key)) warnings.push(`${label}: theme.yaml has no setting ${key}, so it is ignored`)
  }
  const css = sheets(raw.css, "css")
  const styles: Record<string, PackStyle> = {}
  if (raw.styles != null && !isObject(raw.styles)) warnings.push(`${label}: styles must map a style's name to its base and stylesheets`)
  for (const [name, def] of Object.entries(isObject(raw.styles) ? raw.styles : {})) {
    if (!PACK_STYLE_NAME.test(name)) {
      warnings.push(`${label}: styles.${name}: a style's name is lower-case letters, digits and -, so it is left out`)
      continue
    }
    const style = isObject(def) ? def : {}
    if (typeof style.base !== "string") {
      warnings.push(`${label}: styles.${name}: needs a base, the built-in style it builds on, so it is left out`)
      continue
    }
    styles[name] = { base: style.base, css: sheets(style.css, `styles.${name}.css`) }
  }
  const all = [...css, ...Object.values(styles).flatMap((s) => s.css)]
  const fonts = [...new Set(all.flatMap((f) => fontFaces(fs.readFileSync(path.join(dir, f), "utf8"))))]
  return { pack: { preset, dir, file, theme, style: raw.style, css, styles, fonts }, warnings }
}

/** Every file a pack publishes, from its folder: those of PACK_TYPES, outside hidden folders and node_modules. */
export function packFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(child)
      else if (entry.isFile() && PACK_TYPES[path.extname(entry.name).toLowerCase()]) out.push(child)
    }
  }
  walk("")
  return out.sort()
}
