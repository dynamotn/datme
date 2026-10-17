import type { FolderNode } from "./vault"
import { countNotes } from "./vault"
import { folderIcon, noteIcon } from "./icons"
import { site } from "../site.config"

/**
 * The explorer's tree as HTML. Every page shows only part of it: the top
 * level and the folders holding the page, opened, with the page marked. The
 * whole tree is one file per language (/static/explorer.<lang>.html) that the
 * browser swaps in, so pages do not each carry every note of the vault.
 */

const text = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")

const CHEVRON = '<span class="chev"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span>'

/** A URL path as the explorer compares them: decoded, without a trailing slash. */
function norm(p: string): string {
  try {
    p = decodeURIComponent(p)
  } catch {
    // keep as is
  }
  return p.replace(/\/+$/, "") || "/"
}

/** The folders holding the page at `path`, outermost first, and its own folder when it is a folder's page. */
export function trail(root: FolderNode, path: string): Set<string> {
  const here = norm(path)
  const walk = (f: FolderNode): FolderNode[] | undefined => {
    if (f.dir && norm(f.url) === here) return [f]
    if (f.notes.some((n) => norm(n.url) === here)) return [f]
    for (const c of f.folders) {
      const below = walk(c)
      if (below) return [f, ...below]
    }
    return undefined
  }
  return new Set((walk(root) ?? []).map((f) => f.dir).filter(Boolean))
}

interface Options {
  /** Folders whose contents are written out, opened; others are left empty. Every folder when undefined. */
  open?: Set<string>
  /** The page's own path, whose link is marked current. */
  current?: string
}

/** The `<ul>` of a folder: its folders, then its notes, as the explorer lists them. */
export function explorerTree(folder: FolderNode, opts: Options = {}): string {
  const here = opts.current === undefined ? undefined : norm(opts.current)
  const mark = (url: string) => (here !== undefined && norm(url) === here ? ' aria-current="page"' : "")
  const list = (f: FolderNode): string => {
    let html = "<ul>"
    for (const c of f.folders) {
      const full = !opts.open
      const opened = opts.open?.has(c.dir) ?? false
      // The link sits beside the toggle, not inside it: a summary must hold no other control.
      html +=
        `<li class="folder"><details data-dir="${attr(c.dir)}"${opened ? " open" : ""}>` +
        `<summary aria-label="${attr(c.name)}">${CHEVRON}</summary>` +
        (full || opened ? list(c) : "<ul></ul>") +
        `</details><a class="folder-link" href="${attr(c.url)}"${mark(c.url)}>${folderIcon(c.dir) ?? ""}${text(c.name)}</a>` +
        `<span class="count">${countNotes(c)}</span></li>`
    }
    for (const n of f.notes) {
      const stage = n.stage && f.dir === "" ? `<span class="stage-icon">${text(site.stages[n.stage].icon)}</span>` : ""
      html += `<li><a href="${attr(n.url)}" title="${attr(n.title)}"${mark(n.url)}>${stage}${noteIcon(n.key, n.source.fm) ?? ""}${text(n.title)}</a></li>`
    }
    return html + "</ul>"
  }
  return list(folder)
}
