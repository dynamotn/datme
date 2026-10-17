import { site, type SiteConfig, type Style } from "../site.config"
import type { Note } from "./vault"

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

/** Page style of a note: that of its folder; the site style when there is no note. */
export function lookOf(note: Pick<Note, "dir"> | undefined): Style {
  return note ? lookOfDir(note.dir) : site.appearance.style
}
