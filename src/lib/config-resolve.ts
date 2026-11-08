/** The config as datme uses it: datme.yaml checked, its defaults and theme pack filled in, and what follows from it. */
import path from "node:path"
import { z } from "astro/zod"
import { folderDisplayName, slugTag } from "./slug"
import { basePath } from "./base"
import { loadPack, type PackStyle } from "./theme-pack"
import {
  BENTO_TILES,
  type localized,
  makeSchema,
  type Lang,
  type MenuEntry,
  PAGE_STYLES,
  SHAPED_STYLES,
  type Style,
  type StyleName,
  STYLES,
  themeFields,
  type TtsConfig,
} from "./config-schema"

export interface StageDef {
  icon: string
  label: Record<Lang, string>
  order: number
}

/** Folders never scanned for notes, on top of the ones listed in the config. */
const DEFAULT_IGNORE = [".git", ".obsidian", ".trash", "node_modules", "private", "templates"]

/**
 * The three kinds of note of a Zettelkasten, usable by name in the config.
 * English first: other languages fall back to it. Any other stage is the
 * vault's own: a label, or an icon and a label.
 */
const STAGE_PRESETS: Record<string, Omit<StageDef, "order">> = {
  fleeting: { icon: "🌱", label: { "en-US": "Fleeting", "vi-VN": "Thoáng qua" } },
  literature: { icon: "📖", label: { "en-US": "Literature", "vi-VN": "Tài liệu" } },
  permanent: { icon: "🌳", label: { "en-US": "Permanent", "vi-VN": "Vĩnh viễn" } },
}

/** The icon of a stage the config gives none. */
const STAGE_ICON = "🗂️"

/** Icons for common note types (from tags like type/book); datme.yaml can add or override them. */
const DEFAULT_TYPES: Record<string, string> = {
  article: "📰",
  blog: "✍️",
  book: "📕",
  composition: "🎼",
  example: "🧪",
  insight: "💡",
  memorial: "🕯️",
  methodology: "🧭",
  moc: "🗺️",
  notion: "💭",
  organization: "🏢",
  person: "👤",
  place: "📍",
  quote: "💬",
  summary: "📝",
  term: "🔤",
  thing: "📦",
  tool: "🔧",
  vault: "🗄️",
  video: "🎬",
}

export type Hemisphere = "north" | "south"

/** `appearance.seasons` as the hemisphere whose seasons the garden follows, or false. */
function seasonsOf(v: boolean | { hemisphere: Hemisphere }): false | { hemisphere: Hemisphere } {
  if (v === true) return { hemisphere: "north" }
  return v
}

/** Pick a value for every language: exact tag, then same base language, then the first one. */
function localize(v: z.infer<typeof localized> | undefined, langs: Lang[], fallback: string): Record<Lang, string> {
  const out: Record<Lang, string> = {}
  for (const lang of langs) {
    if (typeof v === "string") out[lang] = v
    else if (v) {
      const base = lang.split("-")[0]
      out[lang] = v[lang] ?? Object.entries(v).find(([k]) => k.split("-")[0] === base)?.[1] ?? Object.values(v)[0] ?? fallback
    } else out[lang] = fallback
  }
  return out
}

/** Footer columns in the order written; single links gather in a first column without a heading. */
function footerGroups(footer: Record<string, string | MenuEntry[]>, navItem: (item: MenuEntry) => NavItem, langs: Lang[]): FooterGroup[] {
  const loose: NavItem[] = []
  const groups: FooterGroup[] = []
  for (const [key, value] of Object.entries(footer)) {
    if (typeof value === "string") loose.push({ kind: "url", target: value, label: localize(key, langs, key) })
    else if (value.length) groups.push({ title: key, items: value.map(navItem) })
  }
  return loose.length ? [{ items: loose }, ...groups] : groups
}

export interface NavItem {
  kind: "home" | "tags" | "archive" | "recent" | "timeline" | "map" | "stats" | "calendar" | "practice" | "changes" | "note" | "url"
  /** Wikilink target for notes, href for URLs. */
  target?: string
  label?: Record<Lang, string>
}

/** A column of footer links, under its heading when it has one. */
export interface FooterGroup {
  title?: string
  items: NavItem[]
}

export class ConfigError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = "ConfigError"
  }
}

/** A problem of the config that does not stop the build, reported against a file as `datme check` does. */
export interface ConfigWarning {
  file: string
  message: string
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const isStyle = (name: unknown): name is Style => (STYLES as readonly unknown[]).includes(name)

/**
 * Lays the theme pack `theme.preset` names under the config: its values fill what `theme:`
 * leaves out, its style is the site's unless `appearance.style` is set, and its styles join the
 * built-in ones. Whatever is wrong with the pack is a warning, never a failed build.
 */
function withPack(raw: unknown, vault: string) {
  const config = isObject(raw) ? raw : {}
  const theme = isObject(config.theme) ? config.theme : {}
  const styles: Record<StyleName, PackStyle> = {}
  if (typeof theme.preset !== "string" || !theme.preset) return { raw, styles, warnings: [] as ConfigWarning[] }
  const { pack, warnings: found } = loadPack(theme.preset, vault)
  const warnings = found.map((message) => ({ file: pack?.file ?? "datme.yaml", message }))
  if (!pack) return { raw, styles, warnings }
  const warn = (message: string) => warnings.push({ file: pack.file, message })
  const label = `theme ${pack.preset}`
  const fromPack: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(pack.theme)) {
    const checked = themeFields[key as keyof typeof themeFields].safeParse(value)
    if (checked.success) fromPack[key] = value
    else warn(`${label}: ${key}: ${checked.error.issues[0].message}, so it is ignored`)
  }
  for (const [name, style] of Object.entries(pack.styles)) {
    if (isStyle(name)) warn(`${label}: styles.${name}: a built-in style has that name, so it is left out`)
    else if (!isStyle(style.base)) warn(`${label}: styles.${name}: base ${style.base} is not one of ${STYLES.join(", ")}, so it is left out`)
    else styles[name] = style
  }
  const appearance = isObject(config.appearance) ? config.appearance : {}
  let style = appearance.style
  if (style === undefined && pack.style !== undefined) {
    if (isStyle(pack.style) || (typeof pack.style === "string" && pack.style in styles)) style = pack.style
    else warn(`${label}: style ${JSON.stringify(pack.style)} is no style of datme or of the theme, so it is ignored`)
  }
  // Fonts merge one family at a time; a `fonts:` that is not a map is left for the schema to reject.
  const fonts = theme.fonts === undefined || isObject(theme.fonts) ? { ...(fromPack.fonts as object | undefined), ...theme.fonts } : theme.fonts
  return {
    raw: { ...config, theme: { ...fromPack, ...theme, fonts }, ...(style === undefined ? {} : { appearance: { ...appearance, style } }) },
    styles,
    warnings,
    // Where the accent comes from, for `datme check` to point at: the pack's file when datme.yaml sets none.
    pack: {
      dir: pack.dir,
      css: pack.css,
      fonts: pack.fonts,
      file: pack.file,
      accent: theme.accent === undefined && fromPack.accent !== undefined,
      ...(pack.templates && { templates: pack.templates }),
    },
  }
}

/** Validate a parsed config and fill in every default; only a theme pack is read from the vault. */
export function resolveConfig(raw: unknown, vault: string, env: Record<string, string | undefined> = {}) {
  const packed = withPack(raw, vault)
  const packStyles = packed.styles
  const styleNames: [StyleName, ...StyleName[]] = [...STYLES, ...Object.keys(packStyles)]
  /** The built-in style a style builds on: itself, or the base of a theme pack's. */
  const baseOf = (name: StyleName): Style => (packStyles[name]?.base as Style | undefined) ?? (name as Style)
  const parsed = makeSchema(styleNames).safeParse(packed.raw ?? {})
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")
    throw new ConfigError(`Invalid datme config in ${vault}:\n${issues}`)
  }
  const c = parsed.data
  const langs = [...new Set(c.languages)]
  const navItem = (item: MenuEntry): NavItem =>
    typeof item === "string"
      ? { kind: item }
      : "note" in item
        ? { kind: "note", target: item.note, label: item.label ? localize(item.label, langs, item.note) : undefined }
        : { kind: "url", target: item.url, label: localize(item.label, langs, item.url) }
  const name = path.basename(vault) || "Notes"
  let order = 0
  const stages: Record<string, StageDef> = {}
  // --site sets DATME_SITE_URL, which must be a URL as site.url is.
  if (env.DATME_SITE_URL && !z.url().safeParse(env.DATME_SITE_URL).success) {
    throw new ConfigError(`Invalid site URL "${env.DATME_SITE_URL}" from --site or DATME_SITE_URL: write it in full, as https://notes.example.com`)
  }
  const url = (env.DATME_SITE_URL ?? c.site.url)?.replace(/\/+$/, "")
  /** Set by `--drafts`: drafts and scheduled notes are built too, for previewing. */
  const drafts = env.DATME_DRAFTS === "1"
  /** Set by `--noindex`, as preview builds are: every page is kept out of search engines. */
  const noindex = env.DATME_NOINDEX === "1"
  let webmentions: { domain: string } | undefined
  if (c.webmentions) {
    const domain = c.webmentions.domain ?? (url ? new URL(url).host : undefined)
    if (!domain) throw new ConfigError(`Invalid datme config in ${vault}:\n  - webmentions: needs site.url or webmentions.domain`)
    webmentions = { domain }
  }
  if (c.activitypub && !url) {
    throw new ConfigError(`Invalid datme config in ${vault}:\n  - activitypub: needs site.url, the address other servers reach`)
  }
  // Other servers look the garden up at /.well-known/ of its host, which a site under a path does not own.
  const base = basePath(url)
  if (c.activitypub && base !== "/") {
    throw new ConfigError(`Invalid datme config in ${vault}:\n  - activitypub: needs a site.url at the root of its host, not under ${base}`)
  }
  if (c.search.meaning && !c.related.semantic) {
    throw new ConfigError(`Invalid datme config in ${vault}:\n  - search.meaning: needs related.semantic, whose model it uses`)
  }
  if (c.tts) {
    for (const key of Object.keys(c.tts.models)) {
      if (!langs.some((l) => l === key || l.split("-")[0] === key)) {
        throw new ConfigError(`Invalid datme config in ${vault}:\n  - tts.models.${key}: matches none of the languages ${langs.join(", ")}`)
      }
    }
    c.tts.folders = c.tts.folders.map((p) => p.replace(/^\/+|\/+$/g, ""))
    if (c.tts.folders.includes("")) {
      throw new ConfigError(`Invalid datme config in ${vault}:\n  - tts.folders: an empty folder names no folder of the vault`)
    }
    if (!c.tts.folders.length && !Object.keys(c.tts.frontmatter).length) {
      throw new ConfigError(`Invalid datme config in ${vault}:\n  - tts: selects no notes, set tts.folders or tts.frontmatter`)
    }
  }
  const { readerSwitch } = c.appearance
  // A pack's style with templates of its own reshapes its pages, which the reader switch cannot do.
  const templated = (st: StyleName) => !!packStyles[st]?.templates
  for (const st of Array.isArray(readerSwitch) ? readerSwitch.filter(templated) : []) {
    packed.warnings.push({
      file: "datme.yaml",
      message: `appearance.readerSwitch: ${st} has templates of its own that reshape its pages, so readers cannot pick it`,
    })
  }
  const pageStyle = Array.isArray(readerSwitch) && readerSwitch.find((st) => PAGE_STYLES.includes(baseOf(st)))
  if (pageStyle) {
    throw new ConfigError(
      `Invalid datme config in ${vault}:\n  - appearance.readerSwitch: ${pageStyle} is made for a single page, so readers cannot pick it for the site`,
    )
  }
  // The switch swaps stylesheets only, so a page built for one of these would lose its frame, or keep it in the wrong style.
  const shaped = Array.isArray(readerSwitch) && readerSwitch.find((st) => SHAPED_STYLES.includes(baseOf(st)))
  if (shaped) {
    throw new ConfigError(`Invalid datme config in ${vault}:\n  - appearance.readerSwitch: ${shaped} lays its pages out its own way, so readers cannot pick it`)
  }
  for (const key of Object.keys(c.appearance.stages)) {
    if (!(key in c.stages)) throw new ConfigError(`Invalid datme config in ${vault}:\n  - appearance.stages.${key}: is no stage of \`stages\``)
  }
  for (const key of Object.keys(c.appearance.languages)) {
    if (!langs.some((l) => l === key || l.split("-")[0] === key)) {
      throw new ConfigError(`Invalid datme config in ${vault}:\n  - appearance.languages.${key}: matches none of the languages ${langs.join(", ")}`)
    }
  }
  for (const [folder, def] of Object.entries(c.stages)) {
    // A string naming no preset is the stage's label; without one, the folder's name is.
    const preset = typeof def === "string" ? STAGE_PRESETS[def.toLowerCase()] : undefined
    const own = preset ?? (typeof def === "string" ? { label: def } : (def ?? {}))
    stages[folder] = { icon: own.icon ?? STAGE_ICON, label: localize(own.label, langs, folderDisplayName(folder)), order: order++ }
  }
  return {
    vault,
    url,
    /** The path the site is served under, "/" or "/garden/" for https://x.dev/garden/. */
    base,
    title: localize(c.site.title, langs, name),
    tagline: localize(c.site.tagline, langs, ""),
    author: c.site.author ?? "",
    me: c.site.me,
    fediverse: c.site.fediverse,
    webmentions,
    // Default logo: the first letter of the title, skipping any leading emoji.
    logo: c.site.logo ?? localize(c.site.title, langs, name)[langs[0]].match(/\p{L}/u)?.[0]?.toUpperCase() ?? "✦",
    defaultLang: langs[0],
    langs,
    // DATME_IGNORE is set by the CLI when the output directory sits inside the vault.
    ignore: [...new Set([...DEFAULT_IGNORE, ...c.ignore, ...(env.DATME_IGNORE ? [env.DATME_IGNORE] : [])].map((p) => p.replace(/^\/+|\/+$/g, "")))],
    stages,
    publish: c.publish,
    privateLinks: c.privateLinks,
    // A note's path always ends in .md, so `home: bento` names no note.
    home: (typeof c.home === "string" ? (c.home === "bento" ? "index.md" : c.home) : c.home.note).replace(/^\/+/, ""),
    /** The tiles of a bento home, in order; none for the home of the site's style. */
    bento:
      c.home === "bento"
        ? { tiles: [...BENTO_TILES] }
        : typeof c.home === "object" && c.home.layout === "bento"
          ? { tiles: [...new Set(c.home.tiles)] }
          : undefined,
    conventions: c.conventions,
    footer: footerGroups(c.footer, navItem, langs),
    poweredBy: c.poweredBy,
    nav: c.nav.map(navItem),
    sidebar: c.sidebar.map(navItem),
    encryption: c.encryption,
    analytics: c.analytics,
    comments: c.comments,
    subscribe: c.subscribe,
    history: c.history,
    cname: c.cname,
    redirects: c.redirects,
    headers: c.headers,
    ogImages: c.ogImages,
    llms: c.llms,
    oembed: c.oembed,
    activitypub: c.activitypub,
    neighbours: Object.fromEntries(Object.entries(c.neighbours).map(([k, v]) => [k, v.replace(/\/+$/, "")])),
    askAi: [...new Set(c.askAi)],
    outdated: c.outdated,
    stats: c.stats,
    offline: c.offline,
    drafts,
    noindex,
    map: c.map,
    glossary: c.glossary,
    archiveDeadLinks: c.archiveDeadLinks,
    check: c.check,
    linkPreviews: c.linkPreviews,
    search: c.search,
    bibliography: (typeof c.bibliography === "string" ? [c.bibliography] : (c.bibliography ?? [])).map((p) => p.replace(/^\/+/, "")),
    images: { ...c.images, widths: [...new Set(c.images.widths)].sort((a, b) => a - b) },
    stackedPages: c.stackedPages,
    topics: c.topics,
    graph: c.graph,
    related: c.related,
    tts: c.tts satisfies TtsConfig | undefined,
    theme: { ...c.theme, css: c.theme.css.replace(/^\/+/, "") },
    lineBreaks: { ...c.lineBreaks, folders: c.lineBreaks.folders.map((p) => p.replace(/^\/+|\/+$/g, "")) },
    properties: c.properties,
    types: Object.fromEntries(
      [...new Set([...Object.keys(DEFAULT_TYPES), ...Object.keys(c.types)])].map((type) => [
        type,
        {
          icon: c.types[type]?.icon ?? DEFAULT_TYPES[type],
          label: localize(c.types[type]?.label, langs, type),
        },
      ]),
    ) as Record<string, { icon: string; label: Record<Lang, string> }>,
    appearance: {
      style: c.appearance.style,
      classic: c.appearance.classic.map((p) => p.replace(/^\/+|\/+$/g, "")),
      folders: Object.fromEntries(Object.entries(c.appearance.folders).map(([p, style]) => [p.replace(/^\/+|\/+$/g, ""), style])),
      // Written as in a note's tags: `#poem`, `Poem` and `poem` are the same tag.
      tags: Object.fromEntries(
        Object.entries(c.appearance.tags)
          .map(([tag, style]): [string, StyleName] => [slugTag(tag.replace(/^#/, "")), style])
          .filter(([tag]) => tag),
      ),
      stages: c.appearance.stages,
      // Keyed by every language that has one, a full tag winning over its base.
      languages: Object.fromEntries(
        langs.flatMap((l): [Lang, StyleName][] => {
          const style = c.appearance.languages[l] ?? c.appearance.languages[l.split("-")[0]]
          return style ? [[l, style]] : []
        }),
      ),
      schedule: c.appearance.schedule,
      stream: c.appearance.stream.map((p) => p.replace(/^\/+|\/+$/g, "")),
      seasons: seasonsOf(c.appearance.seasons),
      readerSwitch: (readerSwitch === true
        ? styleNames.filter((st) => !PAGE_STYLES.includes(baseOf(st)) && !SHAPED_STYLES.includes(baseOf(st)))
        : [...new Set(readerSwitch || [])]
      ).filter((st) => !templated(st)),
    },
    strings: c.strings,
    /** Every style the site knows: the built-in ones, then those of its theme pack. */
    styles: styleNames,
    /**
     * The theme pack of `theme.preset`: its folder, stylesheets and templates for every page, styles and own fonts,
     * the file its warnings point at, and whether it gives the site its accent.
     */
    pack: packed.pack && { ...packed.pack, styles: packStyles },
    /** Problems of the config that do not stop the build, reported by `datme check`. */
    warnings: packed.warnings,
  }
}

export type SiteConfig = ReturnType<typeof resolveConfig>
