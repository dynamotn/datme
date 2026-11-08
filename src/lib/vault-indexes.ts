import { site, type Lang } from "../site.config"
import { langPrefix } from "./i18n"
import { sluggify, slugToUrl, folderDisplayName } from "./slug"
import type { Backlink, FolderNode, Note, Vault } from "./vault-types"

/** The indexes worked out from the notes of every language: backlinks, tags and the folder tree. */
export function deriveIndexes(notes: Vault["notes"]): Pick<Vault, "backlinks" | "tags" | "trees" | "folders"> {
  const backlinks = {} as Vault["backlinks"]
  const tags = {} as Vault["tags"]
  const trees = {} as Vault["trees"]
  const folders = {} as Vault["folders"]
  for (const lang of site.langs) {
    const bl = new Map<string, Backlink[]>()
    const tg = new Map<string, Note[]>()
    for (const n of notes[lang]) {
      const seen = new Set<string>()
      // What a protected note links to is part of its secret content; an unlisted one is found only by its link.
      for (const l of n.protected || n.unlisted ? [] : n.links) {
        if (l.key === n.key || seen.has(l.key)) continue
        seen.add(l.key)
        // Added in place: copying the list for each link made a note linked from thousands cost millions of copies.
        const list = bl.get(l.key)
        if (list) list.push({ note: n, context: l.context })
        else bl.set(l.key, [{ note: n, context: l.context }])
      }
      if (n.unlisted) continue
      for (const tag of n.tags) {
        const parts = tag.split("/")
        for (let i = 1; i <= parts.length; i++) {
          const t = parts.slice(0, i).join("/")
          const list = tg.get(t)
          if (list) list.push(n)
          else tg.set(t, [n])
        }
      }
    }
    backlinks[lang] = bl
    tags[lang] = new Map([...tg].sort(([a], [b]) => a.localeCompare(b)))
    const { root, all } = buildTree(
      notes[lang].filter((n) => !n.unlisted && !n.isHome),
      lang,
    )
    trees[lang] = root
    folders[lang] = all
  }
  return { backlinks, tags, trees, folders }
}

function buildTree(list: Note[], lang: Lang): { root: FolderNode; all: Map<string, FolderNode> } {
  const mk = (dir: string): FolderNode => {
    const segment = dir.split("/").pop() ?? ""
    return {
      segment,
      name: folderDisplayName(segment),
      dir,
      url: slugToUrl(langPrefix(lang) + sluggify(dir)) + (dir ? "/" : ""),
      folders: [],
      notes: [],
    }
  }
  const root = mk("")
  const all = new Map<string, FolderNode>([["", root]])
  const ensure = (dir: string): FolderNode => {
    const hit = all.get(dir)
    if (hit) return hit
    const node = mk(dir)
    all.set(dir, node)
    const parent = ensure(dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "")
    parent.folders.push(node)
    return node
  }
  for (const n of list) {
    const folder = ensure(n.dir)
    if (n.dir && n.source.stem === folder.segment) folder.folderNote = n
    else folder.notes.push(n)
  }
  const collator = new Intl.Collator(lang, { numeric: true })
  for (const f of all.values()) {
    f.folders.sort((a, b) => collator.compare(a.segment, b.segment))
    f.notes.sort((a, b) => collator.compare(a.title, b.title))
  }
  return { root, all }
}

/** Number of notes under a folder, recursively; folder notes introduce their folder and are not counted. */
export function countNotes(f: FolderNode): number {
  return f.notes.length + f.folders.reduce((acc, c) => acc + countNotes(c), 0)
}
