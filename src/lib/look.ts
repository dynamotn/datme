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

/** Style of a folder: the deepest rule among `classic` and `folders` that covers it, else the site style. */
export function resolveLook(dir: string, appearance: Rules): Style {
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
  return best ? best[1] : style
}

/** Style of a folder's pages. */
export function lookOfDir(dir: string): Style {
  return resolveLook(dir, site.appearance)
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
  projects: { frame: "full-norail" },
  talks: { frame: "full-norail" },
  recipes: { frame: "full-norail" },
  places: { frame: "full-norail" },
  shelf: { frame: "full-norail" },
  books: { frame: "full-norail" },
  movies: { frame: "full-norail" },
}

/** Page style of a note: its own `style`, else its layout's, else that of its folder; the site style when there is no note. */
export function lookOf(note: Pick<Note, "dir" | "style" | "layout"> | undefined): Style {
  if (!note) return site.appearance.style
  return note.style ?? (note.layout && LAYOUT_LOOKS[note.layout]?.style) ?? lookOfDir(note.dir)
}

/** Frame of a note's page: its own `chrome`, else its layout's, else full. */
export function frameOf(note: Pick<Note, "chrome" | "layout"> | undefined): Frame {
  return note?.chrome ?? (note?.layout && LAYOUT_LOOKS[note.layout]?.frame) ?? "full"
}

/** Whether a style opens dark when the reader has not chosen a scheme. */
export function startsDark(look: Style): boolean {
  return look === "darkroom"
}
