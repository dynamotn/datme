import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { load as loadYaml, JSON_SCHEMA } from "js-yaml"
import { site, type Lang } from "../site.config"
import { langPrefix } from "./i18n"
import { sluggify, slugTag, slugToUrl, folderDisplayName } from "./slug"
import { preprocess, type LinkRef } from "./obsidian"

/** A published markdown file of the vault, independent of language. */
export interface SourceNote {
  /** Vault-relative path without the .md extension. */
  key: string
  file: string
  stem: string
  /** Vault-relative directory, "" for the vault root. */
  dir: string
  fm: Record<string, unknown>
  raw: string
  isHome: boolean
}

/** A source note as seen in one language. */
export interface Note {
  key: string
  lang: Lang
  slug: string
  url: string
  title: string
  aliases: string[]
  tags: string[]
  created?: Date
  updated?: Date
  banner?: string
  bannerPos: string
  cssclasses: string[]
  description?: string
  /** Top-level folder of the note when the config defines it as a stage. */
  stage?: string
  types: string[]
  isBlog: boolean
  isMoc: boolean
  isHome: boolean
  unlisted: boolean
  dir: string
  /** Markdown after language filtering and Obsidian syntax conversion. */
  md: string
  links: LinkRef[]
  source: SourceNote
}

export interface Backlink {
  note: Note
  context: string
}

export interface FolderNode {
  segment: string
  name: string
  dir: string
  url: string
  folders: FolderNode[]
  notes: Note[]
  /** A note named after its folder, shown as the folder's introduction. */
  folderNote?: Note
}

export interface Vault {
  version: number
  sources: Map<string, SourceNote>
  notes: Record<Lang, Note[]>
  byKey: Record<Lang, Map<string, Note>>
  backlinks: Record<Lang, Map<string, Backlink[]>>
  tags: Record<Lang, Map<string, Note[]>>
  trees: Record<Lang, FolderNode>
  folders: Record<Lang, Map<string, FolderNode>>
  /** Vault-relative paths of every asset referenced by a published note. */
  assets: Set<string>
  resolveNote(target: string, fromDir: string): SourceNote | undefined
  resolveAsset(target: string, fromDir: string): string | undefined
}

const MD_EXT = /\.md$/i

function isIgnored(rel: string): boolean {
  return site.ignore.some((ig) => rel === ig || rel.startsWith(ig + "/"))
}

function walk(dir: string, out: { md: string[]; files: string[] }, rel = ""): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name
    if (isIgnored(childRel) || entry.name.startsWith(".")) continue
    const abs = path.join(dir, entry.name)
    let isDir = entry.isDirectory()
    if (entry.isSymbolicLink()) {
      try {
        isDir = fs.statSync(abs).isDirectory()
      } catch {
        continue
      }
    }
    if (isDir) walk(abs, out, childRel)
    else if (MD_EXT.test(entry.name)) out.md.push(childRel)
    else out.files.push(childRel)
  }
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function parseFrontmatter(src: string): { fm: Record<string, unknown>; body: string } {
  const m = src.match(FM_RE)
  if (!m) return { fm: {}, body: src }
  let fm: Record<string, unknown> = {}
  try {
    const parsed = loadYaml(m[1], { schema: JSON_SCHEMA })
    if (parsed && typeof parsed === "object") fm = parsed as Record<string, unknown>
  } catch {
    // malformed frontmatter: treat the note as having none
  }
  return { fm, body: src.slice(m[0].length) }
}

function toArray(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) return v.filter((x) => x != null).map(String)
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean)
  return [String(v)]
}

function toDate(v: unknown): Date | undefined {
  if (v == null || v === "") return undefined
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Port of the fork's MultiLanguage transformer: keeps blocks of one language. */
export function filterLanguage(src: string, lang: Lang): string {
  let inFence = false
  let inLang = false
  let inThisLang = false
  const out: string[] = []
  for (let line of src.split("\n")) {
    line = line.replace(/[\t\r ]*$/, "")
    if (line.includes("```")) inFence = !inFence
    if (!inFence) {
      const m = line.match(/<!--lang:(.*)-->/)
      if (m) {
        if (m[1] === "*") {
          inLang = false
          inThisLang = false
        } else {
          inLang = true
          inThisLang = m[1] === lang
        }
        continue
      }
      if (inLang && !inThisLang) continue
    }
    out.push(line)
  }
  return out.join("\n")
}

/** Created/updated dates from git history, keyed by vault-relative path. */
function gitDates(): Map<string, { created: Date; updated: Date }> {
  const dates = new Map<string, { created: Date; updated: Date }>()
  try {
    const top = execFileSync("git", ["-C", site.vault, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim()
    const prefix = path.relative(top, site.vault)
    const log = execFileSync(
      "git",
      ["-C", site.vault, "-c", "core.quotepath=off", "log", "--format=%x00%ct", "--name-only", "--", "*.md"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    )
    let ts = 0
    for (const line of log.split("\n")) {
      if (line.startsWith("\0")) {
        ts = Number(line.slice(1)) * 1000
        continue
      }
      if (!line) continue
      const rel = prefix ? path.relative(prefix, line) : line
      const d = new Date(ts)
      const cur = dates.get(rel)
      if (!cur) dates.set(rel, { created: d, updated: d })
      else cur.created = d
    }
  } catch {
    // not a git repository: fall back to the filesystem
  }
  return dates
}

function buildVault(version: number): Vault {
  const found = { md: [] as string[], files: [] as string[] }
  walk(site.vault, found)

  // Index every asset by path and by basename, for Obsidian's shortest-path lookup.
  const assetByPath = new Map<string, string>()
  const assetByName = new Map<string, string[]>()
  for (const rel of found.files) {
    assetByPath.set(rel.toLowerCase(), rel)
    const name = path.posix.basename(rel).toLowerCase()
    assetByName.set(name, [...(assetByName.get(name) ?? []), rel])
  }

  const sources = new Map<string, SourceNote>()
  let homeTarget: string | undefined
  let skippedProtected = 0
  for (const rel of found.md) {
    const abs = path.join(site.vault, rel)
    const src = fs.readFileSync(abs, "utf8")
    const { fm, body } = parseFrontmatter(src)
    if (fm.publish !== true && fm.publish !== "true") continue
    if (fm.draft === true || fm.draft === "true") continue
    // Encrypted pages are not part of the prototype yet: never publish them in clear text.
    if (fm.password != null) {
      skippedProtected++
      continue
    }
    const key = rel.replace(MD_EXT, "")
    const isHome = key === "index"
    if (isHome) {
      try {
        homeTarget = path.relative(site.vault, fs.realpathSync(abs)).replace(MD_EXT, "")
      } catch {
        // not a symlink
      }
    }
    sources.set(key, {
      key,
      file: abs,
      stem: path.posix.basename(key),
      dir: path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel),
      fm,
      raw: body,
      isHome,
    })
  }
  if (homeTarget && homeTarget !== "index") sources.delete(homeTarget)
  if (skippedProtected > 0) {
    console.warn(`[datme] skipped ${skippedProtected} password-protected note(s)`)
  }

  const byPath = new Map<string, SourceNote>()
  const byStem = new Map<string, SourceNote[]>()
  const byAlias = new Map<string, SourceNote>()
  for (const s of sources.values()) {
    byPath.set(s.key.toLowerCase(), s)
    const stem = s.stem.toLowerCase()
    byStem.set(stem, [...(byStem.get(stem) ?? []), s])
    for (const a of toArray(s.fm.aliases ?? s.fm.alias)) byAlias.set(a.toLowerCase(), s)
  }
  const home = sources.get("index")
  if (home && homeTarget) {
    const stem = path.posix.basename(homeTarget).toLowerCase()
    byStem.set(stem, [home, ...(byStem.get(stem) ?? [])])
  }

  function resolveNote(target: string, fromDir: string): SourceNote | undefined {
    const t = target.trim().replace(MD_EXT, "").replace(/^\/+/, "")
    if (!t) return undefined
    const lower = t.toLowerCase()
    const relative = path.posix.normalize(path.posix.join(fromDir, t)).toLowerCase()
    const hit = byPath.get(relative) ?? byPath.get(lower)
    if (hit) return hit
    if (!lower.includes("/")) {
      const cands = byStem.get(lower)
      if (cands?.length) return [...cands].sort((a, b) => a.key.length - b.key.length)[0]
    } else {
      for (const [k, s] of byPath) if (k.endsWith("/" + lower)) return s
    }
    return byAlias.get(lower)
  }

  function resolveAsset(target: string, fromDir: string): string | undefined {
    const t = decodeURI(target.trim()).replace(/^\/+/, "")
    const relative = path.posix.normalize(path.posix.join(fromDir, t)).toLowerCase()
    const hit = assetByPath.get(relative) ?? assetByPath.get(t.toLowerCase())
    if (hit) return hit
    const cands = assetByName.get(path.posix.basename(t).toLowerCase())
    return cands?.length ? [...cands].sort((a, b) => a.length - b.length)[0] : undefined
  }

  const git = gitDates()
  const assets = new Set<string>()
  const notes = {} as Vault["notes"]
  const byKey = {} as Vault["byKey"]

  for (const lang of site.langs) {
    notes[lang] = []
    byKey[lang] = new Map()
    for (const s of sources.values()) {
      const titleField = s.fm.title
      const titleMap =
        titleField && typeof titleField === "object" ? (titleField as Record<string, string>) : undefined
      const langTitle = titleMap?.[lang]
      const title = langTitle ?? (typeof titleField === "string" ? titleField : s.stem)
      const slugBase = s.isHome ? "index" : sluggify(path.posix.join(s.dir, langTitle ?? s.stem))
      const slug = langPrefix(lang) + slugBase
      const tags = [...new Set(toArray(s.fm.tags ?? s.fm.tag).map((x) => slugTag(x.replace(/^#/, ""))))]
      const relFile = s.key + ".md"
      const stat = fs.statSync(s.file)
      const created = toDate(s.fm.created ?? s.fm.date) ?? git.get(relFile)?.created ?? stat.birthtime
      const updated =
        toDate(s.fm.updated ?? s.fm.modified ?? s.fm.lastmod) ?? git.get(relFile)?.updated ?? stat.mtime

      let banner: string | undefined
      if (typeof s.fm.banner === "string" && s.fm.banner) {
        const b = s.fm.banner.replace(/^!?\[\[|\]\]$/g, "")
        if (/^https?:\/\//.test(b)) banner = b
        else {
          const asset = resolveAsset(b, s.dir)
          if (asset) {
            assets.add(asset)
            banner = assetUrl(asset)
          }
        }
      }
      const pos = (v: unknown) => (v != null && v !== "" ? `${Number(v) * 100}%` : "50%")

      const pre = preprocess(filterLanguage(s.raw, lang), {
        lang,
        dir: s.dir,
        resolveNote,
        resolveAsset,
      })
      pre.assets.forEach((a) => assets.add(a))

      const types = tags.filter((x) => x.startsWith("type/")).map((x) => x.slice(5))
      const note: Note = {
        key: s.key,
        lang,
        slug,
        url: slugToUrl(slug),
        title,
        aliases: toArray(s.fm.aliases ?? s.fm.alias),
        tags,
        created,
        updated,
        banner,
        bannerPos: `${pos(s.fm.banner_x)} ${pos(s.fm.banner_y)}`,
        cssclasses: toArray(s.fm.cssclasses ?? s.fm.cssclass),
        description: typeof s.fm.description === "string" ? s.fm.description : undefined,
        stage: site.stages[s.dir.split("/")[0]] ? s.dir.split("/")[0] : undefined,
        types,
        isBlog: types.includes("blog"),
        isMoc: types.includes("moc"),
        isHome: s.isHome,
        unlisted: s.fm.unlisted === true,
        dir: s.dir,
        md: pre.md,
        links: pre.links,
        source: s,
      }
      notes[lang].push(note)
      byKey[lang].set(s.key, note)
    }
  }

  // Links are resolved to keys during preprocessing; URLs need the slugs computed above.
  function noteUrl(key: string, lang: Lang): string {
    return byKey[lang]?.get(key)?.url ?? "#"
  }
  for (const lang of site.langs) {
    for (const n of notes[lang]) n.md = n.md.replace(/\u0001URL:([^\u0001]+)\u0001/g, (_, k) => noteUrl(k, lang))
  }

  const backlinks = {} as Vault["backlinks"]
  const tags = {} as Vault["tags"]
  const trees = {} as Vault["trees"]
  const folders = {} as Vault["folders"]
  for (const lang of site.langs) {
    const bl = new Map<string, Backlink[]>()
    const tg = new Map<string, Note[]>()
    for (const n of notes[lang]) {
      const seen = new Set<string>()
      for (const l of n.links) {
        if (l.key === n.key || seen.has(l.key)) continue
        seen.add(l.key)
        bl.set(l.key, [...(bl.get(l.key) ?? []), { note: n, context: l.context }])
      }
      if (n.unlisted) continue
      for (const tag of n.tags) {
        const parts = tag.split("/")
        for (let i = 1; i <= parts.length; i++) {
          const t = parts.slice(0, i).join("/")
          tg.set(t, [...(tg.get(t) ?? []), n])
        }
      }
    }
    backlinks[lang] = bl
    tags[lang] = new Map([...tg].sort(([a], [b]) => a.localeCompare(b)))
    const { root, all } = buildTree(notes[lang].filter((n) => !n.unlisted && !n.isHome), lang)
    trees[lang] = root
    folders[lang] = all
  }

  return {
    version,
    sources,
    notes,
    byKey,
    backlinks,
    tags,
    trees,
    folders,
    assets,
    resolveNote,
    resolveAsset,
  }
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

export function assetUrl(rel: string): string {
  return "/assets/" + rel.split("/").map(encodeURIComponent).join("/")
}

/** Number of notes under a folder, recursively. */
export function countNotes(f: FolderNode): number {
  return f.notes.length + (f.folderNote ? 1 : 0) + f.folders.reduce((acc, c) => acc + countNotes(c), 0)
}

let cached: Vault | undefined

/** The vault index, rebuilt in dev whenever the watcher bumps the version. */
export function getVault(): Vault {
  const version = (globalThis as { __vaultVersion?: number }).__vaultVersion ?? 0
  if (!cached || cached.version !== version) cached = buildVault(version)
  return cached
}

export function listed(lang: Lang): Note[] {
  return getVault().notes[lang].filter((n) => !n.unlisted)
}

export function byRecent(list: Note[], field: "created" | "updated" = "updated"): Note[] {
  return [...list].sort((a, b) => (b[field]?.getTime() ?? 0) - (a[field]?.getTime() ?? 0))
}
