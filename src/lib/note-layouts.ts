import type { Layout, Note } from "./vault"
import { t } from "./i18n"
import { escapeAttr } from "./html"
import { basesOf, collectionKindOf, isCollection, plain, replaceBases, runBase, withoutBases } from "./layout-collections"
import {
  changelogHtml,
  checklistHtml,
  citeHtml,
  compareHtml,
  compareOf,
  cvHtml,
  decisionHtml,
  dialogueHtml,
  faqHtml,
  galleryHtml,
  galleryOfNotes,
  glossaryEntries,
  glossaryHtml,
  highlightsHtml,
  hubHtml,
  lessonsOf,
  letterFacts,
  letterHtml,
  linksHtml,
  loreHtml,
  paperHtml,
  paperOf,
  poemHtml,
  quotesHtml,
  recipeCardHtml,
  recipeHtml,
  releasesUrl,
  sections,
  syllabusHtml,
  termNotes,
  timelineHtml,
  timelineOfNotes,
  tripHtml,
  usesHtml,
} from "./layout-pages"

export * from "./layout-collections"
export * from "./layout-shelves"
export * from "./layout-pages"

/**
 * Page layouts a note asks for with its `layout` property. Some reshape the
 * note's own text (a résumé, a gallery, a timeline, links, uses, a FAQ,
 * quotes, a paper, a decision record, a changelog, a dialogue, reading
 * highlights, a glossary, a trip, a syllabus, a poem, a letter, a comparison,
 * a checklist, a recipe card, a hub, lore); collections list other notes,
 * grouped by status, year or any property. A collection whose note embeds a base lists what the base finds,
 * in its order and groups.
 */

type Render = (note: Note, html: string, translation?: string) => string

/** The page layouts: what each makes of a note's rendered text. Collections are listed by their own page instead. */
const PAGE_LAYOUTS: Partial<Record<Layout, Render>> = {
  cv: (_note, html) => cvHtml(html),
  gallery: (note, html) => {
    // The covers of the notes a base finds join the note's own pictures.
    const bases = basesOf(note)
    return galleryHtml(replaceBases(html, (i) => (bases[i] ? galleryOfNotes(runBase(note, bases[i]).notes) : "")))
  },
  timeline: (note, html) => {
    const bases = basesOf(note)
    return timelineHtml(
      replaceBases(html, (i) => {
        if (!bases[i]) return ""
        const r = runBase(note, bases[i])
        return timelineOfNotes(r.notes, note.lang, r.sorted)
      }),
    )
  },
  links: (_note, html) => linksHtml(html),
  uses: (_note, html) => usesHtml(html),
  faq: (_note, html) => faqHtml(html),
  quotes: (_note, html) => quotesHtml(html),
  paper: (note, html) => {
    const s = t(note.lang)
    return note.protected ? html : paperHtml(html, s.abstract, citeHtml(paperOf(note).entry, s.citeThis))
  },
  decision: (_note, html) => decisionHtml(html),
  changelog: (note, html) => {
    const feed = note.protected ? "" : `<p class="release-feed"><a href="${escapeAttr(releasesUrl(note))}">${escapeAttr(t(note.lang).rss)}</a></p>`
    return changelogHtml(html, note.lang, feed)
  },
  dialogue: (note, html) => {
    // `speakers` lists names, or maps them to pictures.
    const raw = note.source.fm.speakers
    const names = Array.isArray(raw) ? raw.map(plain) : raw && typeof raw === "object" ? Object.keys(raw) : []
    return dialogueHtml(html, { ...Object.fromEntries(names.map((n) => [n, undefined])), ...note.speakers })
  },
  highlights: (_note, html) => highlightsHtml(html),
  glossary: (note, html) => {
    const { intro, entries } = glossaryEntries(html)
    return glossaryHtml(intro, [...entries, ...termNotes(note, entries)], note.lang, t(note.lang).glossaryLetters)
  },
  trip: (note, html) => tripHtml(note, html),
  syllabus: (note, html) => {
    const { intro, parts } = sections(html)
    return syllabusHtml(intro, lessonsOf(note, parts), note.lang)
  },
  poem: (note, html, translation) => {
    if (note.protected) return html
    const pair = note.translation && translation !== undefined ? note.translation : undefined
    const numbered = note.source.fm.numbered === true || String(note.source.fm.numbered).toLowerCase() === "true"
    // The original, the language the note says it is in, goes first.
    const original = typeof note.source.fm.lang === "string" ? note.source.fm.lang : note.sourceLang
    return poemHtml(html, numbered, pair && { html: translation!, lang: pair.lang, ownLang: note.contentLang, first: pair.lang === original })
  },
  letter: (note, html) => {
    if (note.protected) return html
    const { dateline, signature } = letterFacts(note)
    return letterHtml(html, dateline, signature)
  },
  compare: (note, html) => {
    const s = t(note.lang)
    const { intro, options } = compareOf(html)
    return compareHtml(intro, options, plain(note.source.fm.pick), {
      pros: s.comparePros,
      cons: s.compareCons,
      summary: s.compareSummary,
      picked: s.comparePicked,
    })
  },
  checklist: (note, html) => {
    const s = t(note.lang)
    return checklistHtml(html, { progress: s.checklistProgress, reset: s.checklistReset })
  },
  "recipe-card": (note, html) => (note.protected ? html : recipeCardHtml(note, html, t(note.lang).printCard)),
  hub: (note, html) => hubHtml(note.title, html),
  lore: (note, html) => (note.protected ? html : loreHtml(note, html)),
}

/**
 * A note's rendered text reshaped by its layout; a recipe of a collection gets
 * its two columns. `translation` is the rendered text a poem goes beside.
 */
export function layoutHtml(note: Note, html: string, translation?: string): string {
  const render = note.layout && PAGE_LAYOUTS[note.layout]
  if (render) return render(note, html, translation)
  if (note.layout === undefined) return collectionKindOf(note) === "recipes" ? recipeHtml(html) : html
  // A collection lists what its base finds itself.
  return isCollection(note.layout) ? withoutBases(html) : html
}
