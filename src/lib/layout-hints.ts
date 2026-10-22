import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeStringify from "rehype-stringify"
import type { Lang } from "../site.config"
import type { FolderNode, Layout, Note, Vault } from "./vault"
import { isKanban } from "./kanban"
import { markProsCons } from "./layout-source"
import { parseLocation } from "./places"
import {
  ABSTRACT,
  BLOCKS,
  INGREDIENTS,
  TASK_BOX,
  compareOf,
  decisionPartOf,
  episodeNumber,
  field,
  hasLocator,
  innerOf,
  isCollection,
  isDecisionStatus,
  nameDay,
  plain,
  priceOf,
  progressOf,
  quotesOf,
  ratingOf,
  releasesOf,
  sections,
  sourcesOf,
  speakersOf,
  termOf,
  textOf,
  topLevel,
} from "./note-layouts"

/**
 * Layouts `datme check` suggests for notes that ask for none: a note whose
 * text reads like a dialogue, a wall of quotes, a changelog…, and a folder
 * whose notes share the properties of a collection (books, episodes, days…).
 * Each guess reads the note as its layout would, and is made only when
 * nearly all of the note fits, so an essay quoting someone once stays an essay.
 */

/** A layout `datme check` suggests. */
export interface LayoutHint {
  /** The note the layout goes in, vault-relative; for a folder without a folder note, the folder note to create. */
  file: string
  layout: Layout
  /** How much of the note or folder fits the layout, from 0 to 1. */
  score: number
  /** Why, in a few words: "12 of 14 paragraphs start with a speaker's name". */
  reason: string
  /** For a collection: the folder it would list. */
  folder?: string
  /** The folder has no folder note yet: `file` is to be created. */
  create?: boolean
}

/** Whether a note's frontmatter names a layout, `none` included: such a note gets no suggestion. */
export const asksLayout = (fm: Record<string, unknown>): boolean => typeof fm.layout === "string" && fm.layout.trim() !== ""

/** A note's text as the detectors read it. */
export interface Reading {
  html: string
  fm: Record<string, unknown>
  /** Top-level blocks, blank text between them left out. */
  blocks: { tag?: string; html: string }[]
  /** Each H2 and the text under it. */
  parts: { heading: string; body: string }[]
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify)

/**
 * A note's markdown as HTML, as much as the detectors need: no highlighting,
 * maths or raw HTML (embeds and locked parts stay out), and links keep only
 * their words. Pros and cons written `+`/`-` are marked as the compare layout reads them.
 */
export function readNote(md: string, fm: Record<string, unknown> = {}): Reading {
  const html = String(processor.processSync(markProsCons(md).replace(/<\/?(?:a|span)\b[^>]*>/g, "")))
  return { html, fm, blocks: topLevel(html, BLOCKS).filter((b) => b.tag || b.html.trim()), parts: sections(html).parts }
}

type Guess = Omit<LayoutHint, "file">

/** "12 of 14": a share, and the score it gives when it reaches `min`. */
const share = (n: number, of: number, min: number) => (of && n / of >= min ? n / of : 0)

/** Paragraphs mostly opening with the names of a few speakers, who each speak more than once. */
function dialogue(r: Reading): Guess | undefined {
  const parts = r.html.split(/(<p>[\s\S]*?<\/p>)/)
  const paragraphs = parts.filter((p) => p.startsWith("<p>")).length
  // One-letter names are Q and A, which a FAQ or flashcards use.
  const said = speakersOf(parts).filter((s) => s && [...s.name].length > 1)
  const names = new Set(said.map((s) => s!.name.toLowerCase()))
  const score = said.length >= 6 && names.size >= 2 && names.size * 2 <= said.length ? share(said.length, paragraphs, 0.6) : 0
  return score ? { layout: "dialogue", score, reason: `${said.length} of ${paragraphs} paragraphs start with a speaker's name` } : undefined
}

/** Blocks that hold text: not headings or rules. */
const textBlocks = (r: Reading) => r.blocks.filter((b) => b.tag && !/^h\d$/.test(b.tag))

/** Mostly quotes signed "— Name". */
function quotes(r: Reading): Guess | undefined {
  const found = quotesOf(r.html).length
  const blocks = textBlocks(r).length
  const score = found >= 3 ? share(found, blocks, 0.6) : 0
  return score ? { layout: "quotes", score, reason: `${found} of ${blocks} blocks are quotes signed "— Name"` } : undefined
}

/** Mostly tasks. */
function checklist(r: Reading): Guess | undefined {
  const tasks = r.html.match(TASK_BOX)?.length ?? 0
  const items = r.html.match(/<li\b/g)?.length ?? 0
  const paragraphs = r.blocks.filter((b) => b.tag === "p").length
  const score = tasks >= 5 ? share(tasks, items + paragraphs, 0.6) : 0
  return score ? { layout: "checklist", score, reason: `${tasks} of ${items + paragraphs} items and paragraphs are tasks` } : undefined
}

/** A version number, such as 1.2.0 or v2.0, or Keep a Changelog's Unreleased. */
const VERSION = /^v?\d+\.\d+(?:\.\d+)*\b|^unreleased\b/i

/** H2 sections that are versions. */
function changelog(r: Reading): Guess | undefined {
  const { releases } = releasesOf(r.html)
  const versions = releases.filter((x) => VERSION.test(x.version))
  const score = versions.length >= 3 ? share(versions.length, releases.length, 0.8) : 0
  return score
    ? { layout: "changelog", score, reason: `${versions.length} of ${releases.length} sections are versions, such as "${versions[0].version}"` }
    : undefined
}

/** H2 sections named by a year or a date, in order. */
function timeline(r: Reading): Guess | undefined {
  const years = r.parts.flatMap((p) => {
    const text = textOf(p.heading)
    const year = !VERSION.test(text) && text.slice(0, 20).match(/\b(1\d|20)\d{2}\b/)?.[0]
    return year ? [Number(year)] : []
  })
  const rising = years.every((y, i) => !i || y >= years[i - 1])
  const falling = years.every((y, i) => !i || y <= years[i - 1])
  const score = years.length >= 4 && (rising || falling) ? share(years.length, r.parts.length, 0.8) : 0
  return score ? { layout: "timeline", score, reason: `${years.length} of ${r.parts.length} sections are dated, in order` } : undefined
}

/** H2 sections that are questions. */
function faq(r: Reading): Guess | undefined {
  const asked = r.parts.filter((p) => /[?？]$/.test(textOf(p.heading))).length
  const score = asked >= 3 ? share(asked, r.parts.length, 0.8) : 0
  return score ? { layout: "faq", score, reason: `${asked} of ${r.parts.length} sections are questions` } : undefined
}

/** H2 options, each with pros and cons. */
function compare(r: Reading): Guess | undefined {
  const { options } = compareOf(r.html)
  const weighed = options.filter((o) => o.pros.length && o.cons.length).length
  const score = weighed >= 2 ? share(weighed, options.length, 0.6) : 0
  return score ? { layout: "compare", score, reason: `${weighed} of ${options.length} sections list pros and cons` } : undefined
}

/** Paragraphs mostly defining a term in bold, each term once. */
function glossary(r: Reading): Guess | undefined {
  const paragraphs = r.blocks.filter((b) => b.tag === "p")
  const terms = paragraphs.flatMap((p) => termOf(p.html)?.term.toLowerCase() ?? [])
  // A term said again and again is a speaker.
  const score = terms.length >= 5 && new Set(terms).size >= terms.length * 0.9 ? share(terms.length, paragraphs.length, 0.6) : 0
  return score ? { layout: "glossary", score, reason: `${terms.length} of ${paragraphs.length} paragraphs define a term in bold` } : undefined
}

/** Quotes and list items that name where they are in a book, as Readwise and Kindle export them. */
function highlights(r: Reading): Guess | undefined {
  const units = r.blocks.flatMap((b) =>
    b.tag === "blockquote" ? [b.html] : b.tag === "ul" || b.tag === "ol" ? topLevel(innerOf(b.html), ["li"]).flatMap((li) => (li.tag ? [li.html] : [])) : [],
  )
  const located = units.filter(hasLocator).length
  const score = located >= 3 ? share(located, units.length, 0.5) : 0
  return score ? { layout: "highlights", score, reason: `${located} of ${units.length} quotes and items give a location or page` } : undefined
}

/** Authors with a DOI or an arXiv id. */
function paper(r: Reading): Guess | undefined {
  const id = plain(r.fm.doi) ? "a DOI" : plain(r.fm.arxiv) ? "an arXiv id" : ""
  if (!id || !plain(r.fm.authors ?? r.fm.author)) return undefined
  const abstract = r.parts.some((p) => ABSTRACT.test(textOf(p.heading)))
  return { layout: "paper", score: abstract ? 1 : 0.9, reason: `has authors and ${id}${abstract ? ", and an abstract" : ""}` }
}

/** A decision's status, and sections for its context and the decision. */
function decision(r: Reading): Guess | undefined {
  if (!isDecisionStatus(r.fm.status)) return undefined
  const found = new Set(r.parts.flatMap((p) => decisionPartOf(textOf(p.heading)) ?? []))
  if (!found.has("context") || !found.has("decision")) return undefined
  const named = [...found].map((x) => x[0].toUpperCase() + x.slice(1)).join(", ")
  return { layout: "decision", score: (6 + found.size) / 10, reason: `has status "${plain(r.fm.status)}" and ${named} sections` }
}

/** The greeting a letter opens with. */
const SALUTATION = /^(dear|my dear|hi|hello|thân gửi|thân mến|kính gửi|gửi|lieber|liebe|cher|chère|querido|querida|estimado|estimada)\b/i

/** A place, a date, and a signature or a greeting. */
function letter(r: Reading): Guess | undefined {
  if (!plain(r.fm.place) || !plain(r.fm.date)) return undefined
  const first = r.blocks.find((b) => b.tag === "p")
  const signed = !!plain(r.fm.signature)
  const greets = !!first && SALUTATION.test(textOf(first.html))
  if (!signed && !greets) return undefined
  return { layout: "letter", score: signed ? 0.95 : 0.85, reason: `has a place, a date and ${signed ? "a signature" : "a greeting"}` }
}

/** Stanzas of short lines, and nothing else but a heading. */
function poem(r: Reading): Guess | undefined {
  const stanzas = r.blocks.filter((b) => b.tag === "p")
  if (stanzas.length < 2 || r.blocks.length - stanzas.length > 1 || r.blocks.some((b) => !b.tag || !/^(p|h\d)$/.test(b.tag))) return undefined
  const lines = stanzas
    .flatMap((s) => innerOf(s.html).split(/<br>\n?|\n/))
    .map(textOf)
    .filter(Boolean)
  const words = lines.reduce((sum, l) => sum + l.split(" ").length, 0) / lines.length
  const short = lines.filter((l) => l.length <= 60).length
  // A shopping list has lines of a word or two; prose has long ones.
  if (lines.length < 8 || lines.length < stanzas.length * 3 || words < 3 || words > 10) return undefined
  const score = share(short, lines.length, 0.9)
  return score ? { layout: "poem", score, reason: `${lines.length} short lines in ${stanzas.length} stanzas` } : undefined
}

/** Steps to number. */
const STEPS = /<ol\b/

/** An Ingredients section with a list, and numbered steps. */
function recipeCard(r: Reading): Guess | undefined {
  const at = r.parts.findIndex((p) => INGREDIENTS.test(textOf(p.heading)) && /<[uo]l\b/.test(p.body))
  if (at < 0 || !r.parts.some((p, i) => i !== at && STEPS.test(p.body))) return undefined
  return { layout: "recipe-card", score: 0.9, reason: "has an Ingredients list and numbered steps" }
}

/** The detectors of a note's own text, the most specific first: on a tie, the first wins. */
const NOTE_GUESSES = [paper, decision, letter, changelog, highlights, dialogue, quotes, compare, recipeCard, faq, glossary, timeline, checklist, poem]

/** The layout a note's text and properties fit best, if one fits well. */
export function guessNoteLayout(r: Reading): Guess | undefined {
  let best: Guess | undefined
  for (const guess of NOTE_GUESSES) {
    const g = guess(r)
    if (g && (!best || g.score > best.score)) best = g
  }
  return best
}

/** What the notes of a collection have in common, and how a reason says it. */
const COLLECTIONS: [layout: Layout, has: string, test: (n: Note) => boolean][] = [
  ["episodes", "have a number and an audio file", (n) => episodeNumber(n) > 0 && !!field(n, "audio")],
  ["wishlist", "have a price", (n) => !!priceOf(n)],
  ["daily", "are named after a day", (n) => !!nameDay(n)],
  ["movies", "name a director", (n) => !!field(n, "director|directors")],
  ["books", "have an author and a rating, ISBN or page count", (n) => !!field(n, "author|authors") && (ratingOf(n) !== undefined || !!field(n, "isbn|pages"))],
  ["talks", "name an event and a date", (n) => !!field(n, "event|venue") && !!field(n, "date")],
  [
    "courses",
    "name a provider and an instructor or progress",
    (n) => !!field(n, "provider|platform") && (!!progressOf(n) || !!field(n, "instructor|instructors|teacher")),
  ],
  ["people", "have a role and an organization", (n) => !!field(n, "role|job|position") && !!field(n, "org|company|organization|affiliation")],
  ["snippets", "have a language and a code block", (n) => !!field(n, "language") && /^(```|~~~)/m.test(n.md)],
  [
    "recipes",
    "have servings or an Ingredients section",
    (n) => !!field(n, "servings|serves|yield") || new RegExp(`^#{2,3}\\s.*(${INGREDIENTS.source})`, "im").test(n.md),
  ],
  ["places", "have a location", (n) => !!parseLocation(n.source.fm.location ?? n.source.fm.coordinates)],
  ["projects", "have a repository, or a start and a status", (n) => /^https?:\/\//.test(field(n, "repo")) || (!!field(n, "start") && !!field(n, "status"))],
  // Web Clipper keeps where a page came from.
  ["bookmarks", "have a source URL", (n) => /^https?:\/\//.test(field(n, "source|url"))],
]

/** The fewest notes a folder needs, all fitting, before it is suggested a collection. */
const MIN_ITEMS = 4
/** The share of a folder's notes that must fit a collection. */
const MIN_SHARE = 0.8

/** The collection a folder's notes fit best, if one fits nearly all of them. */
export function guessCollection(notes: Note[]): Guess | undefined {
  let best: Guess | undefined
  for (const [layout, has, test] of COLLECTIONS) {
    const fit = notes.filter(test).length
    const score = fit >= MIN_ITEMS ? share(fit, notes.length, MIN_SHARE) : 0
    if (score && (!best || score > best.score)) best = { layout, score, reason: `${fit} of ${notes.length} notes ${has}` }
  }
  return best
}

/** Folders a collection already lists, with the folders under them. */
function listedFolders(notes: Note[]): string[] {
  return notes.flatMap((n) =>
    isCollection(n.layout) && n.layout !== "digest" && n.layout !== "questions" && n.layout !== "quotebook" && !n.protected ? sourcesOf(n).folders : [],
  )
}

/**
 * Layouts to suggest in a language: for each published note that asks for
 * none (and is not protected, a day of the journal, a deck, a board or
 * slides), the layout its text fits; for each folder whose notes fit a
 * collection, that collection, in its folder note. Protected notes are never
 * read, nor counted in a folder; drafts are there only when the vault was read with `--drafts`.
 */
export function suggestLayouts(vault: Pick<Vault, "notes" | "folders">, lang: Lang): LayoutHint[] {
  const notes = vault.notes[lang]
  const hints: LayoutHint[] = []
  const listed = listedFolders(notes)
  const folderNotes = new Set<string>()
  for (const f of vault.folders[lang].values()) {
    if (!f.dir || (f.folderNote && (f.folderNote.protected || asksLayout(f.folderNote.source.fm)))) continue
    if (listed.some((dir) => dir === "" || f.dir === dir || f.dir.startsWith(dir + "/"))) continue
    const guess = guessCollection(f.notes.filter((n) => !n.protected && !n.unlisted && !n.isHome && !isCollection(n.layout)))
    if (!guess) continue
    if (f.folderNote) folderNotes.add(f.folderNote.key)
    hints.push({ ...guess, file: folderNoteOf(f), folder: f.dir, ...(f.folderNote ? {} : { create: true }) })
  }
  for (const n of notes) {
    const fm = n.source.fm
    if (n.protected || folderNotes.has(n.key) || asksLayout(fm) || n.deck || n.slides || isKanban(fm) || nameDay(n)) continue
    const guess = guessNoteLayout(readNote(n.md, fm))
    if (guess) hints.push({ ...guess, file: n.source.key + ".md" })
  }
  return hints.sort((a, b) => a.file.localeCompare(b.file))
}

/** The folder note of a folder: the one it has, else the one to create, named after it. */
const folderNoteOf = (f: FolderNode) => (f.folderNote ? f.folderNote.source.key : `${f.dir}/${f.segment}`) + ".md"

/** The report of `datme check --suggest`: each note, the line to add to its frontmatter, and why. */
export function formatHints(hints: LayoutHint[]): string {
  if (!hints.length) return "No layout to suggest."
  const lines: string[] = []
  for (const h of hints) {
    lines.push(`${h.file}${h.create ? "  (new folder note)" : ""}`)
    const what = h.folder ? `lists ${h.folder}/ as a collection: ` : ""
    lines.push(`  layout: ${h.layout.padEnd(12)} ${what}${h.reason} (${Math.round(h.score * 100)}%)`)
  }
  lines.push("", `${hints.length} suggestion${hints.length === 1 ? "" : "s"}. Add the line to the note's frontmatter, or "layout: none" to keep it as it is.`)
  return lines.join("\n")
}
