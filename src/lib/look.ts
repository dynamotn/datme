import { site, type SiteConfig, type Style, type StyleName } from "../site.config"
import type { Layout, Note } from "./vault"

/** Navigation frames a note can ask for with its `chrome` property. */
export const CHROMES = ["full", "minimal"] as const
export type Chrome = (typeof CHROMES)[number]
/** Frame a page is drawn with: a chrome, or the full frame without its rail. */
export type Frame = Chrome | "full-norail"

/** Reads a property that must be one of `options`: trimmed and lower-cased; an unknown string comes back as `invalid`. */
export function pickOption<T extends string>(value: unknown, options: readonly T[]): { value?: T; invalid?: string } {
  if (typeof value !== "string" || !value.trim()) return {}
  const key = value.trim().toLowerCase()
  const found = options.find((o) => o === key)
  return found ? { value: found } : { invalid: value }
}

type Rules = Pick<SiteConfig["appearance"], "style" | "classic" | "folders">
type TagRules = Pick<SiteConfig["appearance"], "tags">
type NoteRules = Rules & TagRules & Pick<SiteConfig["appearance"], "stages">

/** The rule that gave a page its style, for `datme dev` to name. */
export type LookRule =
  | { kind: "note" }
  | { kind: "layout"; layout: Layout }
  | { kind: "tags"; tag: string }
  | { kind: "stages"; stage: string }
  | { kind: "folders" | "classic"; folder: string }
  | { kind: "site" }

/** The rule that gave a page its frame. */
export type FrameRule = { kind: "note" } | { kind: "layout"; layout: Layout } | { kind: "default" }

export interface Explained<T, R> {
  value: T
  rule: R
}

/** Style of a folder and its rule: the deepest of `classic` and `folders` that covers it, else the site style. */
export function explainDir(dir: string, appearance: Rules): Explained<StyleName, LookRule> {
  const { style, classic, folders } = appearance
  const flipped: Style = style === "notebook" ? "classic" : style === "classic" ? "notebook" : "classic"
  const rules: [string, StyleName, boolean][] = [
    ...classic.map((f): [string, StyleName, boolean] => [f, flipped, false]),
    ...Object.entries(folders).map(([f, s]): [string, StyleName, boolean] => [f, s, true]),
  ]
  let best: [string, StyleName, boolean] | undefined
  for (const rule of rules) {
    const [f, , fromFolders] = rule
    if (dir !== f && !dir.startsWith(f + "/")) continue
    if (!best || f.length > best[0].length || (f.length === best[0].length && fromFolders && !best[2])) best = rule
  }
  if (!best) return { value: style, rule: { kind: "site" } }
  return { value: best[1], rule: { kind: best[2] ? "folders" : "classic", folder: best[0] } }
}

/** Style of a folder: the deepest rule among `classic` and `folders` that covers it, else the site style. */
export function resolveLook(dir: string, appearance: Rules): StyleName {
  return explainDir(dir, appearance).value
}

/** What a layout asks for by default: a style (none: the site's own) and a frame. */
export interface LayoutLook {
  style?: Style
  frame: Frame
}

// books, movies and shelf follow the site style until a `library` style exists.
export const LAYOUT_LOOKS: Partial<Record<Layout, LayoutLook>> = {
  cv: { style: "resume", frame: "minimal" },
  links: { style: "classic", frame: "minimal" },
  gallery: { style: "darkroom", frame: "minimal" },
  timeline: { frame: "full-norail" },
  now: { frame: "full-norail" },
  uses: { frame: "full-norail" },
  quotes: { frame: "full-norail" },
  faq: { frame: "full" },
  decision: { frame: "full" },
  paper: { frame: "full-norail" },
  changelog: { frame: "full-norail" },
  dialogue: { frame: "full-norail" },
  highlights: { frame: "full-norail" },
  glossary: { frame: "full-norail" },
  trip: { frame: "full-norail" },
  syllabus: { frame: "full-norail" },
  projects: { frame: "full-norail" },
  talks: { frame: "full-norail" },
  recipes: { frame: "full-norail" },
  places: { frame: "full-norail" },
  shelf: { frame: "full-norail" },
  books: { frame: "full-norail" },
  movies: { frame: "full-norail" },
  daily: { frame: "full-norail" },
  bookmarks: { frame: "full-norail" },
  people: { frame: "full-norail" },
  snippets: { frame: "full-norail" },
  episodes: { frame: "full-norail" },
  courses: { frame: "full-norail" },
  wishlist: { frame: "full-norail" },
  quotebook: { frame: "full-norail" },
  questions: { frame: "full-norail" },
  digest: { frame: "full-norail" },
}

/**
 * Style a note gets from its tags and the rule that gave it: the note's first tag that `appearance.tags`
 * covers, in any case, a nested tag such as `poem/haiku` being covered by `poem`; the deepest such entry wins.
 */
export function explainTags(tags: readonly string[], appearance: TagRules): Explained<StyleName, LookRule> | undefined {
  // Tags match whatever their case, as in Obsidian.
  const entries = Object.entries(appearance.tags)
  for (const tag of tags.map((t) => t.toLowerCase())) {
    let best: [string, StyleName] | undefined
    for (const entry of entries) {
      const key = entry[0].toLowerCase()
      if (tag !== key && !tag.startsWith(key + "/")) continue
      if (!best || key.length > best[0].length) best = entry
    }
    if (best) return { value: best[1], rule: { kind: "tags", tag: best[0] } }
  }
  return undefined
}

/** Style a note gets from its growth stage (a key of `stages`) through `appearance.stages`, and the rule that gave it. */
export function explainStage(stage: string | undefined, appearance: Pick<SiteConfig["appearance"], "stages">): Explained<StyleName, LookRule> | undefined {
  const style = stage === undefined ? undefined : appearance.stages[stage]
  return stage !== undefined && style ? { value: style, rule: { kind: "stages", stage } } : undefined
}

/** What the style of a note's page depends on. */
type LookNote = Pick<Note, "dir" | "style" | "layout"> & { tags?: readonly string[]; stage?: string }

/** Page style of a note and the rule that chose it: its own `style`, else its layout's, its tags', its stage's, or its folder's. */
export function explainLook(note: LookNote | undefined, appearance: NoteRules = site.appearance): Explained<StyleName, LookRule> {
  if (!note) return { value: appearance.style, rule: { kind: "site" } }
  if (note.style) return { value: note.style, rule: { kind: "note" } }
  const fromLayout = note.layout && LAYOUT_LOOKS[note.layout]?.style
  if (note.layout && fromLayout) return { value: fromLayout, rule: { kind: "layout", layout: note.layout } }
  return explainTags(note.tags ?? [], appearance) ?? explainStage(note.stage, appearance) ?? explainDir(note.dir, appearance)
}

/** Page style of a note: its own `style`, else its layout's, its tags', its stage's or its folder's; the site style when there is no note. */
export function lookOf(note: LookNote | undefined): StyleName {
  return explainLook(note).value
}

/** Frame of a note's page and the rule that chose it: its own `chrome`, else its layout's, else full. */
export function explainFrame(note: Pick<Note, "chrome" | "layout"> | undefined): Explained<Frame, FrameRule> {
  if (note?.chrome) return { value: note.chrome, rule: { kind: "note" } }
  const fromLayout = note?.layout && LAYOUT_LOOKS[note.layout]?.frame
  if (note?.layout && fromLayout) return { value: fromLayout, rule: { kind: "layout", layout: note.layout } }
  return { value: "full", rule: { kind: "default" } }
}

/** Frame of a note's page: its own `chrome`, else its layout's, else full. */
export function frameOf(note: Pick<Note, "chrome" | "layout"> | undefined): Frame {
  return explainFrame(note).value
}

/** Styles drawn dark first: a gallery wall at night, a screen of phosphor, blue drawing paper, black lacquer. */
const DARK_FIRST: readonly Style[] = ["darkroom", "terminal", "blueprint", "lacquer"]

/** The built-in style a style builds on: itself, or the base of one a theme pack adds. */
export function baseStyle(look: StyleName, pack: Pick<NonNullable<SiteConfig["pack"]>, "styles"> | undefined = site.pack): Style {
  return (pack?.styles[look]?.base ?? look) as Style
}

/** Whether a style opens dark when the reader has not chosen a scheme. */
export function startsDark(look: StyleName): boolean {
  return DARK_FIRST.includes(baseStyle(look))
}

/** Whether a style shows the garden: notes in beds by stage, with its planted and tended wording. */
export function isGarden(look: StyleName): boolean {
  const base = baseStyle(look)
  return base === "garden" || base === "herbarium"
}
