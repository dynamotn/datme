import { AsyncLocalStorage } from "node:async_hooks"
import { site, type Lang, type StyleName } from "../site.config"
import { CHROMES, pickOption, type Chrome, type FrameRule, type LookRule } from "./look"
import { LAYOUTS, type FolderNode, type Layout, type Note } from "./vault"
import { isCollection, presetGroup, presetGroups } from "./note-layouts"

/** Query keys of the switcher of `datme dev`, named like the note properties they stand in for. */
export const PREVIEW_KEYS = { style: "style", chrome: "chrome", layout: "layout", group: "group" } as const

/** A layout to preview, or `none` to see a note with a layout laid out as usual. */
export type LayoutPreview = Layout | "none"
export const LAYOUT_PREVIEWS: readonly LayoutPreview[] = ["none", ...LAYOUTS]

/** Groupings any collection takes; a property name works too. */
export const GROUPS = ["status", "year", "month", "none"] as const

/** A style, a chrome, a layout and a collection's grouping asked for in the page's address, to try them without editing files. */
export interface Preview {
  style?: StyleName
  chrome?: Chrome
  layout?: LayoutPreview
  /** `group` of a collection: one of GROUPS or properties, fallbacks joined by `|`. */
  group?: string
}

/** What a page is laid out as, before any preview: its note's layout and, for a collection, what it groups by. */
export interface Shape {
  layout?: Layout
  /** The note's own `group:`; undefined when its layout's default applies. */
  group?: string
}

// Astro clears the query of prerendered pages, even under `datme dev`, so the dev server keeps each request's
// own address aside. On globalThis: the config and the pages load this module as two copies.
const g = globalThis as { __datmeRequestUrl?: AsyncLocalStorage<URL> }
const requestUrls = (g.__datmeRequestUrl ??= new AsyncLocalStorage<URL>())

/** Middleware of the dev server: the request's address, query included, stays readable while its page renders. */
export function keepRequestUrl(req: { url?: string }, _res: unknown, next: () => void): void {
  requestUrls.run(new URL(req.url ?? "/", "http://localhost"), next)
}

/** The address of the page being rendered, with the query the dev server kept for it. */
export function pageUrl(url: URL): URL {
  const kept = requestUrls.getStore()
  if (!kept) return url
  const full = new URL(url)
  full.search = kept.search
  return full
}

/** The preview in a page's address; always none outside `datme dev`, so a build never depends on its URL. */
export function previewOf(url: URL, dev = Boolean(process.env.DATME_DEV)): Preview {
  if (!dev) return {}
  url = pageUrl(url)
  const pick = <T extends string>(key: string, options: readonly T[]) => pickOption(url.searchParams.get(key) ?? undefined, options).value
  const group = url.searchParams.get(PREVIEW_KEYS.group)?.trim()
  return {
    style: pick(PREVIEW_KEYS.style, site.styles),
    chrome: pick(PREVIEW_KEYS.chrome, CHROMES),
    layout: pick(PREVIEW_KEYS.layout, LAYOUT_PREVIEWS),
    group: group && /^[\p{L}\p{N}_ .|-]{1,64}$/u.test(group) ? group : undefined,
  }
}

/** The layout a page shows under a preview: the one asked for, none for `none`, else its own. */
export function shownLayout(own: Layout | undefined, preview: Preview): Layout | undefined {
  return preview.layout === undefined ? own : preview.layout === "none" ? undefined : preview.layout
}

/** What a collection groups by: its note's `group:`, else its layout's default. */
export const groupOf = (layout: Layout, group: string | undefined): string | undefined =>
  isCollection(layout) ? (group ?? presetGroup(layout)) : undefined

/** The groupings worth offering a collection: its default, the usual ones (or those of its kind), and the one it has. */
export function groupChoices(layout: Layout, own: string | undefined): string[] {
  return isCollection(layout) ? [...new Set([presetGroup(layout), ...(presetGroups(layout) ?? GROUPS), ...(own ? [own] : [])])] : []
}

/** The note's `group:` as written, when it is one. */
export const ownGroup = (note: Note): string | undefined =>
  typeof note.source.fm.group === "string" && note.source.fm.group ? note.source.fm.group : undefined

/** The note as the preview lays it out: another layout, and another grouping for a collection. */
export function previewNote(note: Note, preview: Preview): Note {
  const layout = shownLayout(note.layout, preview)
  const group = isCollection(layout) ? preview.group : undefined
  if (layout === note.layout && !group) return note
  return { ...note, layout, source: group ? { ...note.source, fm: { ...note.source.fm, group } } : note.source }
}

/**
 * A note standing in for the folder note a folder lacks, so `datme dev` can try
 * a collection of the folder's notes before the note is written.
 */
export function folderStandIn(folder: FolderNode, lang: Lang): Note {
  const key = folder.dir ? `${folder.dir}/${folder.segment}` : folder.segment
  return {
    key,
    lang,
    slug: folder.url.replace(/^\/+|\/+$/g, ""),
    url: folder.url,
    title: folder.name,
    aliases: [],
    tags: [],
    bannerPos: "50% 50%",
    cssclasses: [],
    types: [],
    isBlog: false,
    isMoc: false,
    isHome: false,
    unlisted: false,
    sourceLang: lang,
    translated: true,
    contentLang: lang,
    hardBreaks: false,
    protected: false,
    dir: folder.dir,
    md: "",
    links: [],
    assets: [],
    deck: false,
    lockedParts: [],
    draft: false,
    source: { key, file: `${key}.md`, stem: folder.segment, dir: folder.dir, fm: {}, raw: "", isHome: false },
  }
}

/** The address of this page without any preview. */
export function resetUrl(url: URL): string {
  const next = new URL(url)
  for (const key of Object.values(PREVIEW_KEYS)) next.searchParams.delete(key)
  return next.pathname + next.search + next.hash
}

/** The address of this page previewed with `key` set to `value`, or back to its own when `value` is undefined. */
export function previewUrl(url: URL, key: keyof typeof PREVIEW_KEYS, value: string | undefined): string {
  const next = new URL(url)
  if (value) next.searchParams.set(PREVIEW_KEYS[key], value)
  else next.searchParams.delete(PREVIEW_KEYS[key])
  return next.pathname + next.search + next.hash
}

/** What the page's style and frame come from: a note (its source file), a folder, or neither. */
export type LookTarget =
  /** `tag`: the tag `appearance.tags` would give the note its style by, when it has one. */
  | { kind: "note"; file: string; dir: string; tag?: string }
  | { kind: "folder"; dir: string; file?: string }
  | { kind: "site" }

/** The rule behind a style, in words. */
export function describeLookRule(rule: LookRule, target: LookTarget): string {
  switch (rule.kind) {
    case "note":
      return `style: in ${"file" in target && target.file ? target.file : "the note"}`
    case "layout":
      return `the default of layout: ${rule.layout}`
    case "tags":
      return `appearance.tags → ${rule.tag}`
    case "folders":
      return `appearance.folders → ${rule.folder}`
    case "classic":
      return `appearance.classic → ${rule.folder}`
    case "site":
      return "appearance.style"
  }
}

/** Where a page's layout comes from, in words. */
export function describeLayout(shape: Shape, target: LookTarget): string {
  const file = "file" in target && target.file ? target.file : "the note"
  return shape.layout ? `layout: in ${file}` : "no layout:"
}

/** Where a collection's grouping comes from, in words. */
export function describeGroup(layout: Layout, shape: Shape, target: LookTarget): string {
  const file = "file" in target && target.file ? target.file : "the note"
  return shape.group ? `group: in ${file}` : `the default of layout: ${layout}`
}

/** The rule behind a frame, in words. */
export function describeFrameRule(rule: FrameRule, target: LookTarget): string {
  switch (rule.kind) {
    case "note":
      return `chrome: in ${"file" in target && target.file ? target.file : "the note"}`
    case "layout":
      return `the default of layout: ${rule.layout}`
    case "default":
      return "the default"
  }
}

/** A line to copy and the file it goes in. */
export interface ConfigLine {
  where: string
  code: string
}

/** A YAML key, quoted when it holds what YAML would read otherwise. */
function yamlKey(key: string): string {
  return /^[\p{L}\p{N}_][\p{L}\p{N}_ ./-]*$/u.test(key) && !key.endsWith(" ") ? key : JSON.stringify(key)
}

/**
 * The lines that make a preview stick: in the note's or folder note's
 * frontmatter, or in datme.yaml. `shape` is the page's own layout, which
 * `layout: none` asks to take out.
 */
export function configLines(target: LookTarget, preview: Preview, shape: Shape = {}): ConfigLine[] {
  const lines: ConfigLine[] = []
  const layout = preview.layout !== "none" ? preview.layout : undefined
  const front = [
    layout && `layout: ${layout}`,
    preview.group && `group: ${/[:#]/.test(preview.group) ? JSON.stringify(preview.group) : preview.group}`,
    preview.style && `style: ${preview.style}`,
    preview.chrome && `chrome: ${preview.chrome}`,
  ]
    .filter(Boolean)
    .join("\n")
  const ownFile = target.kind !== "site" ? target.file : undefined
  if (preview.layout === "none" && shape.layout && ownFile) {
    lines.push({ where: `frontmatter of ${ownFile}, taken out`, code: `layout: ${shape.layout}` })
  }
  if (front && target.kind === "note") lines.push({ where: `frontmatter of ${target.file}`, code: front })
  if (preview.style && target.kind === "note" && target.tag) {
    lines.push({ where: `datme.yaml, for every note tagged ${target.tag}`, code: `appearance:\n  tags:\n    ${yamlKey(target.tag)}: ${preview.style}` })
  }
  // Only a folder note gives a folder page its chrome; a folder without one gets it by adding one.
  if (front && target.kind === "folder" && target.dir) {
    const file = target.file ?? `${target.dir}/${target.dir.split("/").pop()}.md`
    lines.push({ where: target.file ? `frontmatter of ${file}` : `frontmatter of a new folder note, ${file}`, code: front })
  }
  if (preview.style && target.kind !== "site" && target.dir) {
    lines.push({ where: "datme.yaml, for the whole folder", code: `appearance:\n  folders:\n    ${yamlKey(target.dir)}: ${preview.style}` })
  }
  if (preview.style && (target.kind === "site" || !target.dir)) {
    lines.push({ where: "datme.yaml, for the whole site", code: `appearance:\n  style: ${preview.style}` })
  }
  return lines
}
