import { site, type SiteConfig, type Style } from "../site.config"
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

/** The rule that gave a page its style, for `datme dev` to name. */
export type LookRule =
  | { kind: "note" }
  | { kind: "layout"; layout: Layout }
  | { kind: "folders" | "classic"; folder: string }
  | { kind: "site" }

/** The rule that gave a page its frame. */
export type FrameRule = { kind: "note" } | { kind: "layout"; layout: Layout } | { kind: "default" }

export interface Explained<T, R> {
  value: T
  rule: R
}

/** Style of a folder and its rule: the deepest of `classic` and `folders` that covers it, else the site style. */
export function explainDir(dir: string, appearance: Rules): Explained<Style, LookRule> {
  const { style, classic, folders } = appearance
  const flipped: Style = style === "notebook" ? "classic" : style === "classic" ? "notebook" : "classic"
  const rules: [string, Style, boolean][] = [
    ...classic.map((f): [string, Style, boolean] => [f, flipped, false]),
    ...Object.entries(folders).map(([f, s]): [string, Style, boolean] => [f, s, true]),
  ]
  let best: [string, Style, boolean] | undefined
  for (const rule of rules) {
    const [f, , fromFolders] = rule
    if (dir !== f && !dir.startsWith(f + "/")) continue
    if (!best || f.length > best[0].length || (f.length === best[0].length && fromFolders && !best[2])) best = rule
  }
  if (!best) return { value: style, rule: { kind: "site" } }
  return { value: best[1], rule: { kind: best[2] ? "folders" : "classic", folder: best[0] } }
}

/** Style of a folder: the deepest rule among `classic` and `folders` that covers it, else the site style. */
export function resolveLook(dir: string, appearance: Rules): Style {
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
}

/** Page style of a note and the rule that chose it: its own `style`, else its layout's, else that of its folder. */
export function explainLook(note: Pick<Note, "dir" | "style" | "layout"> | undefined): Explained<Style, LookRule> {
  if (!note) return { value: site.appearance.style, rule: { kind: "site" } }
  if (note.style) return { value: note.style, rule: { kind: "note" } }
  const fromLayout = note.layout && LAYOUT_LOOKS[note.layout]?.style
  if (note.layout && fromLayout) return { value: fromLayout, rule: { kind: "layout", layout: note.layout } }
  return explainDir(note.dir, site.appearance)
}

/** Page style of a note: its own `style`, else its layout's, else that of its folder; the site style when there is no note. */
export function lookOf(note: Pick<Note, "dir" | "style" | "layout"> | undefined): Style {
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

/** Whether a style opens dark when the reader has not chosen a scheme. */
export function startsDark(look: Style): boolean {
  return DARK_FIRST.includes(look)
}

/** Whether a style shows the garden: notes in beds by stage, with its planted and tended wording. */
export function isGarden(look: Style): boolean {
  return look === "garden" || look === "herbarium"
}
