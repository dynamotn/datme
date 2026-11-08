import type { Lang, StyleName } from "../site.config"
import type { Chrome } from "./look"
import type { LinkRef } from "./obsidian"
import type { CanvasData } from "./canvas"
import type { Place } from "./positions"

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
  "poem",
  "letter",
  "compare",
  "checklist",
  "recipe-card",
  "hub",
  "lore",
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
  /** A letter's signature as a picture (its `signature` property naming an image). */
  signature?: string
  /** The other language a poem is shown beside (its `bilingual` property): its preprocessed markdown. */
  translation?: { lang: Lang; md: string }
  /** Style this page is drawn in (`style` property), instead of its folder's. */
  style?: StyleName
  /** Navigation frame of this page (`chrome` property), instead of the usual one. */
  chrome?: Chrome
  cssclasses: string[]
  description?: string
  /** Content warning (`cw` or `contentWarning` property): shown before the text, which no excerpt, card, feed or search result carries. */
  warning?: string
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
export interface Problem extends Partial<Place> {
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
