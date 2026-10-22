import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { parseYaml } from "./yaml"
import { site, type Lang, type StyleName } from "../site.config"
import { pickOption, CHROMES, type Chrome } from "./look"
import { langPrefix, t } from "./i18n"
import { sluggify, slugTag, slugToUrl, urlToSlug, folderDisplayName } from "./slug"
import { preprocess, DOC, type LinkRef, type LinkProblem } from "./obsidian"
import { parseCanvas, type CanvasData } from "./canvas"
import { flashcards, isDeck } from "./flashcards"
import { isKanban, kanban } from "./kanban"
import { fenceAfter, resolvePassword, splitLocked } from "./locked"
import { isSlides, isTheme, slideDirectives } from "./slides"
import { cite, parseBibtex, type BibEntry } from "./citations"
import katex from "katex"
import crypto from "node:crypto"
import { parseDrawing, parseSelection, renderParts, renderScene, type FileView, type Scene } from "./excalidraw"
import { assetUrl, urlPlaceholder, type DrawnDrawing } from "./obsidian"
import { findInGarden } from "./neighbours"
import { privateLinkText, showsName } from "./privacy"

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
  /** Set for notes with a `password` field; the page is published encrypted. */
  password?: string
}

/** Page layouts a note can ask for with its `layout` property. */
export const LAYOUTS = [
  "cv",
  "gallery",
  "timeline",
  "links",
  "uses",
  "now",
  "faq",
  "quotes",
  "paper",
  "decision",
  "changelog",
  "dialogue",
  "highlights",
  "glossary",
  "trip",
  "syllabus",
  "projects",
  "books",
  "movies",
  "talks",
  "recipes",
  "places",
  "shelf",
  "daily",
  "bookmarks",
  "people",
  "snippets",
  "episodes",
  "courses",
  "wishlist",
  "quotebook",
  "questions",
  "digest",
] as const
export type Layout = (typeof LAYOUTS)[number]

/** A source note as seen in one language. */
export interface Note {
  key: string
  lang: Lang
  slug: string
  url: string
  /** URL the note would have without its permalink; it redirects to `url`. */
  formerUrl?: string
  title: string
  aliases: string[]
  tags: string[]
  created?: Date
  updated?: Date
  banner?: string
  bannerPos: string
  /** Picture standing for the note in a collection: its `cover` property, else its `avatar`, else its banner. */
  cover?: string
  /** Sound of an episode (`audio` property): a URL, or a file of the vault (`file`, vault-relative) that is then published. */
  audio?: { href: string; file?: string }
  /** A course's `certificate`: a URL, or a file of the vault (`file`, vault-relative) that is then published. */
  certificate?: { href: string; file?: string }
  /** How the page is laid out (`layout` property): a page of its own text reshaped, or a collection of notes. */
  layout?: Layout
  /** Pictures of the speakers of a dialogue, by name (its `speakers` property). */
  speakers?: Record<string, string>
  /** Style this page is drawn in (`style` property), instead of its folder's. */
  style?: StyleName
  /** Navigation frame of this page (`chrome` property), instead of the usual one. */
  chrome?: Chrome
  cssclasses: string[]
  description?: string
  /** Configured stage of the note: its `stage` property, else its top-level folder. */
  stage?: string
  types: string[]
  isBlog: boolean
  isMoc: boolean
  isHome: boolean
  unlisted: boolean
  /** Language the note is written in: `lang` frontmatter, else the site's default language. */
  sourceLang: Lang
  /** Whether this language has its own text: the source language, or a <!--lang:xx--> block holding real text. */
  translated: boolean
  /**
   * Language of the blocks the page shows: `lang` when translated, else the
   * note's fallback (`fallback_lang`, or its source language) when that has text.
   */
  contentLang: Lang
  /** Single line breaks are kept (poems), from datme.yaml lineBreaks or `lineBreaks` frontmatter. */
  hardBreaks: boolean
  /** Encrypted with its password: no content may leak into excerpts, search or feeds. */
  protected: boolean
  dir: string
  /** Markdown after language filtering and Obsidian syntax conversion. */
  md: string
  links: LinkRef[]
  /** Vault-relative assets the note embeds or links. */
  assets: string[]
  /** A flashcard deck: its cards and clozes can be practised. */
  deck: boolean
  /**
   * Parts written between <!--lock:password--> and <!--lock:*-->, preprocessed;
   * published encrypted. A part without a password (its group is not set) is left out.
   */
  lockedParts: { password?: string; md: string }[]
  /** A Marp slide deck (`marp: true`): its global directives, from the frontmatter. */
  slides?: Record<string, unknown>
  /** Built only because of `--drafts`: shown as a draft and kept out of search engines. */
  draft: boolean
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

/** A published Obsidian canvas or base, shown as a page of its own. */
export interface Doc {
  rel: string
  kind: "canvas" | "base" | "drawing"
  name: string
  dir: string
  /** Raw source: JSON for a canvas, YAML for a base. */
  src: string
  canvas?: CanvasData
  /** Canvas text nodes per language, as preprocessed markdown, by node id. */
  texts: Record<Lang, Record<string, string>>
}

/** Something wrong in the vault that a reader of the site would notice, reported by `datme check`. */
export interface Problem {
  /** error: visibly broken on the site; warning: likely a mistake; info: expected in a private vault. */
  level: "error" | "warning" | "info"
  /** Vault-relative file the problem is in. */
  file: string
  message: string
  /** The outside URL the problem is about, for dead links. */
  url?: string
}

export interface Vault {
  version: number
  /** Broken links, missing files and clashes found while indexing. */
  problems: Problem[]
  /** Canvases and bases linked from published notes (all of them with `publish: all`). */
  docs: Map<string, Doc>
  /** The note rendered as the home page, if the vault has one. */
  home?: SourceNote
  sources: Map<string, SourceNote>
  notes: Record<Lang, Note[]>
  byKey: Record<Lang, Map<string, Note>>
  backlinks: Record<Lang, Map<string, Backlink[]>>
  tags: Record<Lang, Map<string, Note[]>>
  trees: Record<Lang, FolderNode>
  folders: Record<Lang, Map<string, FolderNode>>
  /** Vault-relative paths of every asset referenced by a published note. */
  assets: Set<string>
  /** CSS of the vault's Marp themes, for slide decks that name one. */
  slideThemes: string[]
  /** Links of published notes to private ones, with the words each left on the page. */
  privateLinks: PrivateLinkUse[]
  resolveNote(target: string, fromDir: string): SourceNote | undefined
  resolveAsset(target: string, fromDir: string): string | undefined
  /** The words a link to a private note shows in a language ("" for none); undefined for any other target. */
  privateLink(target: string, fromDir: string, alias: string | undefined, lang: Lang): string | undefined
}

/** A link from a published note to a private one. */
export interface PrivateLinkUse {
  file: string
  target: string
  /** The words it left on the page, in the default language; "" for none. */
  shown: string
}

const MD_EXT = /\.md$/i

/**
 * A name as the lookups of links compare it: lowercase and in composed Unicode
 * (NFC), since macOS may write file names decomposed (NFD) while links are typed composed.
 */
const fold = (s: string) => s.normalize("NFC").toLowerCase()

/** Whether a vault-relative path is in an ignored folder; regardless of case, so Templates is ignored like templates. */
export function isIgnored(rel: string): boolean {
  const lower = rel.toLowerCase()
  return site.ignore.some((ig) => {
    const i = ig.toLowerCase()
    return lower === i || lower.startsWith(i + "/")
  })
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

/** Vault-relative paths of every markdown file datme reads, published or not. */
export function markdownFiles(): string[] {
  const found = { md: [] as string[], files: [] as string[] }
  walk(site.vault, found)
  return found.md
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontmatter(src: string): { fm: Record<string, unknown>; body: string; error?: string } {
  // A byte order mark, as some Windows editors write, would hide the frontmatter.
  src = src.replace(/^\uFEFF/, "")
  const m = src.match(FM_RE)
  if (!m) return { fm: {}, body: src }
  let fm: Record<string, unknown> = {}
  let error: string | undefined
  try {
    const parsed = parseYaml(m[1], { json: true })
    if (parsed && typeof parsed === "object") fm = parsed as Record<string, unknown>
  } catch (e) {
    // malformed frontmatter: treat the note as having none
    error = (e as Error).message.split("\n")[0]
  }
  return { fm, body: src.slice(m[0].length), error }
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

/** Whether a note's frontmatter allows publishing it under the given mode. */
/** The date a note is scheduled to appear, from `publish_date` (or `publishDate`). */
export function scheduledFor(fm: Record<string, unknown>): Date | undefined {
  return toDate(fm.publish_date ?? fm.publishDate)
}

const flag = (v: unknown) => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined)

/** A draft, or a note scheduled for later: what `--drafts` builds on top of the rest. */
export function isDraft(fm: Record<string, unknown>, now = new Date()): boolean {
  const at = scheduledFor(fm)
  return flag(fm.draft) === true || (at != null && at > now)
}

export function isPublished(fm: Record<string, unknown>, mode: "explicit" | "all", now = new Date(), drafts = false): boolean {
  // A scheduled note waits for its day; the next build after it publishes the note.
  if (!drafts && isDraft(fm, now)) return false
  const publish = flag(fm.publish)
  return mode === "explicit" ? publish === true : publish !== false
}

/** Language a note is written in: its `lang` frontmatter when the site has it, else the site's default. */
export function sourceLangOf(fm: Record<string, unknown>): Lang {
  return typeof fm.lang === "string" && site.langs.includes(fm.lang) ? fm.lang : site.defaultLang
}

/** A link target with %20 and the like decoded; a lone % as in "50% rule" is taken as written. */
function decodeTarget(target: string): string {
  try {
    return decodeURI(target)
  } catch {
    return target
  }
}

/** A <!--lang:xx--> marker alone on its line; one quoted in a sentence or a table is text. */
const LANG_MARKER = /^\s*<!--lang:([^\s>]+)-->$/

/**
 * Languages whose <!--lang:xx--> blocks hold real text, in order of first
 * appearance. Blank lines, headings, HTML comments (even over several lines)
 * and empty list items such as `-` or `- [ ]` don't count, so a block a
 * template filled with headings is still untranslated. Same rules as the
 * lang-blocks Obsidian plugin, so the vault and the site agree.
 */
export function textLanguages(src: string): Lang[] {
  let fence: string | null = null
  let inComment = false
  let current: Lang | null = null
  const found: Lang[] = []
  for (let line of src.split("\n")) {
    line = line.replace(/[\t\r ]*$/, "")
    fence = fenceAfter(fence, line)
    if (fence === null) {
      const m = line.match(LANG_MARKER)
      if (m) {
        current = m[1] === "*" ? null : m[1]
        continue
      }
    }
    const text = line.trim()
    if (inComment) {
      if (text.includes("-->")) inComment = false
      continue
    }
    if (fence === null && text.startsWith("<!--")) {
      if (!text.includes("-->")) inComment = true
      continue
    }
    if (current === null || found.includes(current)) continue
    if (text === "" || /^#{1,6}(\s|$)/.test(text) || /^([-*+]|\d+[.)])(\s+\[.\])?$/.test(text)) continue
    found.push(current)
  }
  return found
}

/**
 * Fallback language of a note: its `fallback_lang` frontmatter (the name
 * PolyglotMarkdown uses), else its source language. An empty value or `none`
 * turns the fallback off.
 */
export function fallbackOf(fm: Record<string, unknown>, sourceLang: Lang): Lang | null {
  if (!("fallback_lang" in fm)) return sourceLang
  const v = fm.fallback_lang
  if (typeof v !== "string") return null
  const value = v.trim()
  return value === "" || value.toLowerCase() === "none" ? null : value
}

/**
 * Language whose blocks a page in `lang` shows. A note without text in `lang`
 * shows its fallback language instead, when that has text, rather than only
 * its shared text; a note without language blocks shows everything anyway.
 */
export function contentLanguage(src: string, lang: Lang, fallback: Lang | null, texts = textLanguages(src)): Lang {
  if (texts.includes(lang) || !src.includes("<!--lang:")) return lang
  return fallback !== null && fallback !== lang && texts.includes(fallback) ? fallback : lang
}

/** Port of the fork's MultiLanguage transformer: keeps blocks of one language. */
export function filterLanguage(src: string, lang: Lang): string {
  let fence: string | null = null
  let inLang = false
  let inThisLang = false
  const out: string[] = []
  for (let line of src.split("\n")) {
    // Only the \r goes: two trailing spaces are a line break.
    line = line.replace(/\r$/, "")
    fence = fenceAfter(fence, line)
    if (fence === null) {
      const m = line.trimEnd().match(LANG_MARKER)
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
    // stderr ignored: outside a repository git would print "fatal: not a git repository".
    const top = execFileSync("git", ["-C", site.vault, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    // git names files with "/", on Windows too.
    const prefix = path.relative(top, site.vault).split(path.sep).join("/")
    const log = execFileSync(
      "git",
      ["-C", site.vault, "-c", "core.quotepath=off", "log", "--format=%x00%ct", "--name-only", "--", "*.md"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    )
    let ts = 0
    for (const line of log.split("\n")) {
      if (line.startsWith("\0")) {
        ts = Number(line.slice(1)) * 1000
        continue
      }
      if (!line) continue
      const rel = prefix ? path.posix.relative(prefix, line) : line
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
    assetByPath.set(fold(rel), rel)
    const name = fold(path.posix.basename(rel))
    assetByName.set(name, [...(assetByName.get(name) ?? []), rel])
  }

  // Excalidraw sources, published or not: an embed is what makes a drawing public.
  const drawingByPath = new Map<string, string>()
  const drawingByName = new Map<string, string[]>()
  for (const rel of [...found.md, ...found.files].filter((f) => /\.excalidraw(\.md)?$/i.test(f))) {
    const lower = fold(rel)
    drawingByPath.set(lower, rel)
    drawingByPath.set(lower.replace(/\.md$/, ""), rel)
    const name = path.posix.basename(lower).replace(/\.md$/, "")
    drawingByName.set(name, [...(drawingByName.get(name) ?? []), rel])
  }

  const problems: Problem[] = []
  const report = (level: Problem["level"], file: string, message: string) => void problems.push({ level, file, message })
  // The config's own, such as a theme pack that could not be used.
  for (const w of site.warnings) report("warning", w.file, w.message)
  // Every note of the vault, published or not, to tell a private link target from a missing one.
  const anyNote = new Set<string>()
  for (const rel of found.md) {
    const key = fold(rel.replace(MD_EXT, ""))
    anyNote.add(key)
    anyNote.add(path.posix.basename(key))
  }

  const sources = new Map<string, SourceNote>()
  let homeTarget: string | undefined
  for (const rel of found.md) {
    const abs = path.join(site.vault, rel)
    const src = fs.readFileSync(abs, "utf8")
    const { fm, body, error } = parseFrontmatter(src)
    // Without its frontmatter a note cannot say `publish: true`, so it silently disappears.
    if (error) report("warning", rel, `frontmatter is not valid YAML, so it is ignored: ${error}`)
    if (!isPublished(fm, site.publish, new Date(), site.drafts)) {
      const at = scheduledFor(fm)
      if (at && at > new Date() && isPublished({ ...fm, publish_date: undefined, publishDate: undefined }, site.publish)) {
        report("info", rel, `scheduled: published from ${at.toISOString().slice(0, 10)}`)
      }
      continue
    }
    // The password never stays in the frontmatter, so nothing can render it by accident.
    const spec = fm.password != null && fm.password !== "" ? String(fm.password) : undefined
    delete fm.password
    const { password, variable } = spec ? resolvePassword(spec) : {}
    // A note whose group password is missing would otherwise go out in the clear.
    if (spec && !password) {
      report("error", rel, `password ${spec} needs the ${variable} environment variable; the note is not published`)
      continue
    }
    const key = rel.replace(MD_EXT, "")
    const isHome = fold(rel) === fold(site.home)
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
      password,
    })
  }
  const home = [...sources.values()].find((s) => s.isHome)
  // A symlinked home note would otherwise be published twice.
  if (home && homeTarget && homeTarget !== home.key) sources.delete(homeTarget)

  const byPath = new Map<string, SourceNote>()
  const byStem = new Map<string, SourceNote[]>()
  const byAlias = new Map<string, SourceNote>()
  for (const s of sources.values()) {
    byPath.set(fold(s.key), s)
    const stem = fold(s.stem)
    byStem.set(stem, [...(byStem.get(stem) ?? []), s])
  }
  for (const s of sources.values()) {
    for (const a of toArray(s.fm.aliases ?? s.fm.alias)) {
      const lower = fold(a)
      const other = byAlias.get(lower) ?? byStem.get(lower)?.find((o) => o !== s)
      if (other && other !== s) {
        report("warning", s.key + ".md", `alias "${a}" is also the name or an alias of ${other.key}.md, so links to it are ambiguous`)
      }
      byAlias.set(lower, s)
    }
  }
  if (home && homeTarget && homeTarget !== home.key) {
    const stem = fold(path.posix.basename(homeTarget))
    byStem.set(stem, [home, ...(byStem.get(stem) ?? [])])
  }

  function resolveNote(target: string, fromDir: string): SourceNote | undefined {
    const t = target.trim().replace(MD_EXT, "").replace(/^\/+/, "")
    if (!t) return undefined
    const lower = fold(t)
    const relative = fold(path.posix.normalize(path.posix.join(fromDir, t)))
    const hit = byPath.get(relative) ?? byPath.get(lower)
    if (hit) return hit
    if (!lower.includes("/")) {
      const cands = byStem.get(lower)
      if (cands?.length) return [...cands].sort((a, b) => a.key.length - b.key.length)[0]
    } else {
      // A partial path such as folder/Note: only notes of that name can end with it.
      const hit = byStem.get(path.posix.basename(lower))?.find((s) => fold(s.key).endsWith("/" + lower))
      if (hit) return hit
    }
    return byAlias.get(lower)
  }

  function resolveDrawing(target: string, fromDir: string): string | undefined {
    const t = fold(decodeTarget(target.trim()).replace(/^\/+/, ""))
    const relative = fold(path.posix.normalize(path.posix.join(fromDir, t)))
    const hit = drawingByPath.get(relative) ?? drawingByPath.get(t)
    if (hit) return hit
    const cands = drawingByName.get(path.posix.basename(t).replace(/\.md$/, ""))
    return cands?.length ? [...cands].sort((a, b) => a.length - b.length)[0] : undefined
  }

  const scenes = new Map<string, Scene>()
  function sceneOf(rel: string): Scene {
    let scene = scenes.get(rel)
    if (!scene) {
      scene = parseDrawing(fs.readFileSync(path.join(site.vault, rel), "utf8"))
      scenes.set(rel, scene)
    }
    return scene
  }

  /** How deep drawings may embed drawings, so a drawing embedding itself still ends. */
  const MAX_NESTING = 3

  /**
   * Resolvers of one drawing: its links lead to published notes (as URL
   * placeholders, filled per language) and its embedded files show images,
   * other drawings, notes or formulas. What it uses is gathered as it draws.
   */
  function drawingContext(rel: string, scene: Scene, used: { assets: string[]; links: string[] }, depth: number) {
    const dir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel)
    const resolveLink = (target: string): string | undefined => {
      if (/^https?:\/\//.test(target)) return target
      const note = resolveNote(target.replace(/#.*$/, ""), dir)
      if (!note) {
        linkProblem(rel, { kind: "link", target })
        return undefined
      }
      used.links.push(note.key)
      return urlPlaceholder(note.key)
    }
    const resolveFile = (id: string): FileView | undefined => {
      const file = scene.files[id]
      // Only pictures: a data URL of anything else is not followed.
      if (file?.dataURL?.startsWith("data:image/")) return { kind: "image", href: file.dataURL }
      const embed = file?.embed
      if (!embed) return undefined
      if (embed.kind === "url") return { kind: "image", href: embed.url }
      if (embed.kind === "latex") {
        return { kind: "math", mathml: katex.renderToString(embed.tex, { output: "mathml", displayMode: true, throwOnError: false }) }
      }
      const nested = /\.excalidraw(\.md)?$/i.test(embed.target) || !/\.\w+$/.test(embed.target) ? resolveDrawing(embed.target, dir) : undefined
      if (nested && depth < MAX_NESTING) {
        try {
          const inner = sceneOf(nested)
          const parts = renderParts(inner, { ...drawingContext(nested, inner, used, depth + 1), idPrefix: `ex${depth + 1}-${hash(nested)}` })
          return { kind: "drawing", viewBox: parts.viewBox, body: parts.body }
        } catch {
          return undefined
        }
      }
      const asset = resolveAsset(embed.target, dir)
      if (asset && /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(asset)) {
        used.assets.push(asset)
        return { kind: "image", href: assetUrl(asset) }
      }
      const note = resolveNote(embed.target, dir)
      if (note) {
        used.links.push(note.key)
        const title = typeof note.fm.title === "string" ? note.fm.title : note.stem
        return { kind: "note", title, href: urlPlaceholder(note.key) }
      }
      // A private note embedded in a drawing shows as such, without its name.
      return /\.\w+$/.test(embed.target) ? undefined : { kind: "note", title: "🔒" }
    }
    return { resolveLink, resolveFile }
  }

  const hash = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8)

  /** Draw a drawing (or the part a fragment names) once per build, whatever embeds it. */
  const drawn = new Map<string, DrawnDrawing | undefined>()
  function drawDrawing(target: string, fromDir: string, fragment = ""): DrawnDrawing | undefined {
    const rel = resolveDrawing(target, fromDir)
    if (!rel) return undefined
    const id = `${rel}#${fragment}`
    if (drawn.has(id)) return drawn.get(id)
    let result: DrawnDrawing | undefined
    try {
      const scene = sceneOf(rel)
      const used = { assets: [] as string[], links: [] as string[] }
      const svg = renderScene(scene, {
        ...drawingContext(rel, scene, used, 0),
        select: parseSelection(fragment),
        idPrefix: `ex-${hash(id)}`,
      })
      result = { svg, assets: [...new Set(used.assets)], links: [...new Set(used.links)], rel }
    } catch (e) {
      report("warning", rel, `drawing${fragment ? ` #${fragment}` : ""} cannot be drawn: ${(e as Error).message}`)
    }
    drawn.set(id, result)
    return result
  }

  /** A vault file as text, such as the transcript of a video. */
  function readText(rel: string): string | undefined {
    try {
      return fs.readFileSync(path.join(site.vault, rel), "utf8")
    } catch {
      return undefined
    }
  }

  function resolveAsset(target: string, fromDir: string): string | undefined {
    const t = decodeTarget(target.trim()).replace(/^\/+/, "")
    const relative = fold(path.posix.normalize(path.posix.join(fromDir, t)))
    const hit = assetByPath.get(relative) ?? assetByPath.get(fold(t))
    if (hit) return hit
    const cands = assetByName.get(fold(path.posix.basename(t)))
    return cands?.length ? [...cands].sort((a, b) => a.length - b.length)[0] : undefined
  }

  /** Whether a link target names a note of the vault that is not published. */
  function isPrivateNote(target: string, fromDir: string): boolean {
    const t = target.trim().replace(/^\/+/, "")
    if (!t || (/\.\w+$/.test(t) && !MD_EXT.test(t))) return false
    const name = fold(t.replace(MD_EXT, ""))
    return anyNote.has(name) || anyNote.has(fold(path.posix.normalize(path.posix.join(fromDir, name))))
  }

  function privateLink(target: string, fromDir: string, alias: string | undefined, lang: Lang): string | undefined {
    if (resolveNote(target, fromDir) || !isPrivateNote(target, fromDir)) return undefined
    return privateLinkText(site.privateLinks, target, alias, t(lang).privateNote)
  }

  /** A note of a neighbour garden; its home page while its index is unknown, e.g. offline on a first build. */
  function gardenLink(name: string, target: string, lang: Lang) {
    const url = site.neighbours[name]
    if (!url) return undefined
    const found = findInGarden(name, target, lang)
    return found === undefined ? { home: url + "/" } : found
  }

  // The same broken link shows up once per language; report it once.
  const seenProblems = new Set<string>()
  const privateLinks: PrivateLinkUse[] = []
  function linkProblem(file: string, p: LinkProblem): void {
    const id = `${file}\0${p.kind}\0${p.target}`
    if (seenProblems.has(id)) return
    seenProblems.add(id)
    const t = p.target.trim().replace(/^\/+/, "")
    const isNote = !/\.\w+$/.test(t) || MD_EXT.test(t)
    if (p.kind === "garden") {
    const [name, note] = [t.slice(0, t.indexOf(":")), t.slice(t.indexOf(":") + 1)]
    report("warning", file, `link to "${note}" not found in the garden "${name}" (${site.neighbours[name]})`)
  } else if (p.kind === "drawing") {
      report("warning", file, `drawing "${t}" is not in the vault, so it is not shown`)
    } else if (isNote && isPrivateNote(t, path.posix.dirname(file))) {
      const shown = p.shown ?? t
      privateLinks.push({ file, target: t, shown })
      report(
        "info",
        file,
        !shown
          ? `${p.kind} to unpublished note "${t}" is left out`
          : showsName(t, shown)
            ? `${p.kind} to unpublished note "${t}" shows its name as plain text; privateLinks: placeholder or hide keeps it off the site`
            : `${p.kind} to unpublished note "${t}" is shown as plain text`,
      )
    } else if (isNote) {
      report("error", file, `${p.kind} to missing note "${t}"`)
    } else {
      report("error", file, `${p.kind} to missing file "${t}"`)
    }
  }

  // Every bibliography of the config, merged; a later file wins for a key both define.
  const bib = new Map<string, BibEntry>()
  for (const rel of site.bibliography) {
    try {
      for (const e of parseBibtex(fs.readFileSync(path.join(site.vault, rel), "utf8"))) bib.set(e.key, e)
    } catch {
      report("error", "datme.yaml", `bibliography "${rel}" cannot be read`)
    }
  }
  const missingCitations = new Set<string>()

  const git = gitDates()
  const assets = new Set<string>()
  const docRefs = new Set<string>(site.publish === "all" ? found.files.filter((f) => DOC.test(f)) : [])
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
      // A title such as 2024 reads as a number in YAML.
      const title = langTitle ?? (typeof titleField === "string" || typeof titleField === "number" ? String(titleField) : s.stem)
      const slugBase = s.isHome ? "index" : sluggify(path.posix.join(s.dir, langTitle ?? s.stem))
      // `permalink` (one value, or one per language) replaces the path-based URL; the old one redirects.
      const permalinkField = s.fm.permalink
      const permalink =
        typeof permalinkField === "string"
          ? permalinkField
          : permalinkField && typeof permalinkField === "object"
            ? (permalinkField as Record<string, string>)[lang]
            : undefined
      const customSlug = !s.isHome && permalink ? sluggify(String(permalink).replace(/^\/+|\/+$/g, "")) : ""
      const slug = langPrefix(lang) + (customSlug || slugBase)
      // An empty tag, such as "" or a bare "#", would link to the list of tags.
      const tags = [...new Set(toArray(s.fm.tags ?? s.fm.tag).map((x) => slugTag(x.replace(/^#/, ""))))].filter(Boolean)
      const relFile = s.key + ".md"
      const stat = fs.statSync(s.file)
      const created = toDate(s.fm.created ?? s.fm.date) ?? git.get(relFile)?.created ?? stat.birthtime
      const updated =
        toDate(s.fm.updated ?? s.fm.modified ?? s.fm.lastmod) ?? git.get(relFile)?.updated ?? stat.mtime

      // A picture or sound property: a URL, or a file of the vault that is then published.
      const fileProp = (field: string, v: unknown = s.fm[field]): { href: string; file?: string } | undefined => {
        if (typeof v !== "string" || !v) return undefined
        const b = v.replace(/^!?\[\[|\]\]$/g, "").replace(/\|.*$/, "")
        if (/^https?:\/\//.test(b)) return { href: b }
        const asset = resolveAsset(b, s.dir)
        if (asset) {
          assets.add(asset)
          return { href: assetUrl(asset), file: asset }
        }
        if (lang === site.defaultLang) report("error", relFile, `${field} "${b}" is not in the vault`)
        return undefined
      }
      const banner = fileProp("banner")?.href
      const cover = fileProp("cover")?.href ?? fileProp("avatar")?.href
      // A protected note's sound is part of what its password guards, so it is not published.
      const audio = s.password ? undefined : fileProp("audio")
      // So is a certificate: a file of the vault named by a protected note stays out of the site.
      const certificate = s.password ? undefined : fileProp("certificate")
      const layoutField = typeof s.fm.layout === "string" ? s.fm.layout.trim().toLowerCase() : undefined
      const layout = LAYOUTS.find((l) => l === layoutField)
      if (layoutField && !layout && lang === site.defaultLang) {
        report("warning", relFile, `layout "${s.fm.layout}" is not one of ${LAYOUTS.join(", ")}, so the note is laid out as usual`)
      }
      // A dialogue's `speakers` map names to pictures, published like a cover; a protected dialogue keeps them.
      const speakers =
        layout === "dialogue" && !s.password && s.fm.speakers && typeof s.fm.speakers === "object" && !Array.isArray(s.fm.speakers)
          ? Object.fromEntries(
              Object.entries(s.fm.speakers as Record<string, unknown>).flatMap(([name, v]) => {
                const src = fileProp(`speakers.${name}`, v)?.href
                return src ? [[name, src]] : []
              }),
            )
          : undefined
      const { value: style, invalid: badStyle } = pickOption(s.fm.style, site.styles)
      if (badStyle && lang === site.defaultLang) {
        report("warning", relFile, `style "${badStyle}" is not one of ${site.styles.join(", ")}, so the note keeps its usual style`)
      }
      const { value: chrome, invalid: badChrome } = pickOption(s.fm.chrome, CHROMES)
      if (badChrome && lang === site.defaultLang) {
        report("warning", relFile, `chrome "${badChrome}" is not one of ${CHROMES.join(", ")}, so the note keeps its usual frame`)
      }
      const pos = (v: unknown) => (v != null && v !== "" ? `${Number(v) * 100}%` : "50%")

      // An untranslated note shows its fallback language's blocks, not only its shared text.
      const sourceLang = sourceLangOf(s.fm)
      const texts = textLanguages(s.raw)
      // A note without language blocks is all source-language text.
      const contentLang = s.raw.includes("<!--lang:")
        ? contentLanguage(s.raw, lang, fallbackOf(s.fm, sourceLang), texts)
        : sourceLang
      // Locked parts leave the note first, so nothing below can read them.
      const { md: filtered, parts } = splitLocked(filterLanguage(s.raw, contentLang))
      const deck = isDeck(tags, filtered, site.conventions.flashcardTags)
      const board = isKanban(s.fm)
      const slides = isSlides(s.fm)
      let body = deck ? flashcards(filtered, t(lang).showAnswer) : board ? kanban(filtered, t(lang).kanbanBoard) : filtered
      if (body.includes("@")) {
        const cited = cite(body, bib, t(lang).references)
        body = cited.md
        for (const key of cited.missing) {
          if (missingCitations.has(`${relFile}\0${key}`)) continue
          missingCitations.add(`${relFile}\0${key}`)
          report("error", relFile, `citation @${key} is not in the bibliography`)
        }
      }
      const pre = preprocess(body, {
        lang,
        dir: s.dir,
        resolveNote,
        resolveAsset,
        drawDrawing,
        drawingPage: resolveDrawing,
        slides,
        readText,
        privateLink: (target, fromDir, alias) => privateLink(target, fromDir, alias, lang),
        gardenLink: (name, target) => gardenLink(name, target, lang),
      })
      // A protected note's files travel inside its ciphertext, and the canvases and bases it links stay unpublished.
      if (!s.password) {
        pre.assets.forEach((a) => assets.add(a))
        pre.docs.forEach((d) => docRefs.add(d))
      }
      // A locked part's links stay out of backlinks and the graph, and its files out of the site.
      const lockedParts = parts.map((part) => {
        const { password, variable } = resolvePassword(part.password)
        if (!password) {
          if (lang === site.defaultLang) {
            report("error", relFile, `locked part ${part.password} needs the ${variable} environment variable; it is left out`)
          }
          return { md: "" }
        }
        const p = preprocess(part.md, {
          lang,
          dir: s.dir,
          resolveNote,
          resolveAsset,
          drawDrawing,
          drawingPage: resolveDrawing,
          readText,
          privateLink: (target, fromDir, alias) => privateLink(target, fromDir, alias, lang),
          gardenLink: (name, target) => gardenLink(name, target, lang),
        })
        for (const problem of p.problems) linkProblem(relFile, problem)
        return { password, md: p.md }
      })
      const directives = slides
        ? slideDirectives(s.fm, (target) => {
            const asset = resolveAsset(target, s.dir)
            if (asset) assets.add(asset)
            return asset && assetUrl(asset)
          })
        : undefined
      for (const p of pre.problems) linkProblem(relFile, p)

      const { typePrefix, blogTags, mapTags } = site.conventions
      const types = tags.filter((x) => x.startsWith(typePrefix)).map((x) => x.slice(typePrefix.length))
      const note: Note = {
        key: s.key,
        lang,
        slug,
        url: slugToUrl(slug),
        formerUrl: customSlug ? slugToUrl(langPrefix(lang) + slugBase) : undefined,
        title,
        aliases: toArray(s.fm.aliases ?? s.fm.alias),
        tags,
        created,
        updated,
        banner,
        bannerPos: `${pos(s.fm.banner_x)} ${pos(s.fm.banner_y)}`,
        cover: cover ?? banner,
        audio,
        certificate,
        layout,
        speakers,
        style,
        chrome,
        // A board or a deck needs the width of the page.
        cssclasses: [
          ...toArray(s.fm.cssclasses ?? s.fm.cssclass),
          ...(board ? ["kanban-board"] : []),
          ...(slides ? ["slide-deck"] : []),
        ],
        description: typeof s.fm.description === "string" ? s.fm.description : undefined,
        // A `stage` property naming a configured stage wins over the top-level folder.
        stage:
          typeof s.fm.stage === "string" && site.stages[s.fm.stage]
            ? s.fm.stage
            : site.stages[s.dir.split("/")[0]]
              ? s.dir.split("/")[0]
              : undefined,
        types,
        isBlog: tags.some((x) => blogTags.includes(x)),
        isMoc: tags.some((x) => mapTags.includes(x)),
        sourceLang,
        translated: lang === sourceLang || texts.includes(lang),
        contentLang,
        hardBreaks:
          typeof s.fm.lineBreaks === "boolean"
            ? s.fm.lineBreaks
            : site.lineBreaks.all ||
              types.some((ty) => site.lineBreaks.types.includes(ty)) ||
              site.lineBreaks.folders.some((f) => s.dir === f || s.dir.startsWith(f + "/")),
        isHome: s.isHome,
        unlisted: flag(s.fm.unlisted) === true,
        draft: site.drafts && isDraft(s.fm),
        protected: s.password != null,
        dir: s.dir,
        md: pre.md,
        links: pre.links,
        assets: [...new Set(pre.assets)],
        deck,
        lockedParts,
        slides: directives,
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
  // Canvases and bases referenced by published notes become pages; canvas text is markdown too.
  const docs = new Map<string, Doc>()
  for (const rel of docRefs) {
    const src = fs.readFileSync(path.join(site.vault, rel), "utf8")
    const dir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel)
    const kind = /\.excalidraw(\.md)?$/i.test(rel) ? "drawing" : rel.toLowerCase().endsWith(".canvas") ? "canvas" : "base"
    const name = path.posix.basename(rel).replace(DOC, "").replace(/\.excalidraw(\.md)?$/i, "")
    const doc: Doc = { rel, kind, name, dir, src, texts: {} }
    if (kind === "drawing") {
      // The whole drawing; its links are URL placeholders, filled per language below.
      const drawing = drawDrawing(rel, "")
      if (!drawing) continue
      drawing.assets.forEach((a) => assets.add(a))
      for (const lang of site.langs) doc.texts[lang] = { svg: drawing.svg }
    }
    if (kind === "canvas") {
      try {
        doc.canvas = parseCanvas(src)
      } catch {
        console.warn(`[datme] skipped ${rel}: not a valid canvas`)
        report("error", rel, "not a valid canvas, so it is not published")
        continue
      }
      for (const lang of site.langs) {
        doc.texts[lang] = {}
        for (const node of doc.canvas.nodes) {
          if (node.type === "text" && node.text) {
            const pre = preprocess(filterLanguage(node.text, lang), {
              lang,
              dir,
              resolveNote,
              resolveAsset,
              drawDrawing,
              drawingPage: resolveDrawing,
              readText,
              privateLink: (target, fromDir, alias) => privateLink(target, fromDir, alias, lang),
              gardenLink: (name, target) => gardenLink(name, target, lang),
            })
            pre.assets.forEach((a) => assets.add(a))
            doc.texts[lang][node.id] = pre.md
          } else if (node.type === "file" && node.file && !resolveNote(node.file, "")) {
            const asset = resolveAsset(node.file, "")
            if (asset && !DOC.test(asset)) assets.add(asset)
          }
        }
      }
    }
    docs.set(rel, doc)
  }

  // A permalink that collides with another note's URL is ignored, so no page is lost.
  for (const lang of site.langs) {
    const taken = new Map<string, Note>()
    for (const n of notes[lang]) if (!n.formerUrl) taken.set(n.url, n)
    for (const n of notes[lang]) {
      if (!n.formerUrl) continue
      const other = taken.get(n.url)
      if (other) {
        console.warn(`[datme] permalink of ${n.key} clashes with ${other.key}; keeping ${n.formerUrl}`)
        n.url = n.formerUrl
        // formerUrl already carries the language prefix.
        n.slug = urlToSlug(n.formerUrl)
        n.formerUrl = undefined
      } else taken.set(n.url, n)
    }
  }

  const fillUrls = (md: string, lang: Lang) => md.replace(/\u0001URL:([^\u0001]+)\u0001/g, (_, k) => noteUrl(k, lang))
  for (const lang of site.langs) {
    for (const n of notes[lang]) {
      n.md = fillUrls(n.md, lang)
      for (const part of n.lockedParts) part.md = fillUrls(part.md, lang)
    }
    for (const d of docs.values()) {
      for (const id of Object.keys(d.texts[lang] ?? {})) d.texts[lang][id] = fillUrls(d.texts[lang][id], lang)
    }
  }

  // Two notes with the same URL: one page silently replaces the other.
  for (const lang of site.langs) {
    const byUrl = new Map<string, Note>()
    for (const n of notes[lang]) {
      const other = byUrl.get(n.url.toLowerCase())
      if (other) report("error", n.key + ".md", `has the same URL ${n.url} as ${other.key}.md, so only one of them is published`)
      else byUrl.set(n.url.toLowerCase(), n)
    }
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
      // What a protected note links to is part of its secret content.
      for (const l of n.protected ? [] : n.links) {
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

  if (sources.size === 0) {
    console.warn(
      site.publish === "explicit"
        ? `[datme] no note in ${site.vault} has \`publish: true\`; add it to the notes to share, or set \`publish: all\` in datme.yaml`
        : `[datme] no publishable note found in ${site.vault}`,
    )
  }

  // Marp themes are CSS files anywhere in the vault, read only when a deck may use one.
  const slideThemes = Object.values(notes).some((ns) => ns.some((n) => n.slides))
    ? found.files.filter((f) => /\.css$/i.test(f)).flatMap((f) => {
        const css = fs.readFileSync(path.join(site.vault, f), "utf8")
        return isTheme(css) ? [css] : []
      })
    : []

  return {
    version,
    problems,
    docs,
    home,
    sources,
    notes,
    byKey,
    backlinks,
    tags,
    trees,
    folders,
    assets,
    slideThemes,
    privateLinks,
    resolveNote,
    resolveAsset,
    privateLink,
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

/** Number of notes under a folder, recursively; folder notes introduce their folder and are not counted. */
export function countNotes(f: FolderNode): number {
  return f.notes.length + f.folders.reduce((acc, c) => acc + countNotes(c), 0)
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
