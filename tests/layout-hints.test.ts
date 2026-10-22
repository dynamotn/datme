import { describe, expect, test } from "bun:test"
import path from "node:path"
import { asksLayout, formatHints, guessCollection, guessNoteLayout, readNote, suggestLayouts, type LayoutHint } from "../src/lib/layout-hints"
import type { FolderNode, Note, Vault } from "../src/lib/vault"

/** The layout a note's markdown and frontmatter would be suggested, and why. */
const guess = (md: string, fm: Record<string, unknown> = {}) => guessNoteLayout(readNote(md, fm))
const layoutOf = (md: string, fm: Record<string, unknown> = {}) => guess(md, fm)?.layout

const paragraphs = (lines: string[]) => lines.join("\n\n")
const essay = paragraphs([
  "Gardens grow slowly, and so do notes. A note written today is a seed.",
  "Some seeds sprout at once, others wait for years before they matter.",
  "> The best time to plant a tree was twenty years ago.\n>\n> — Proverb",
  "That is why a garden is tended rather than built, one note at a time.",
  "Links are the paths between the beds; walking them is how ideas meet.",
])

describe("notes whose text fits a layout", () => {
  test("a dialogue: most paragraphs open with a few speakers' names", () => {
    const md = paragraphs([
      "Recorded in the garden.",
      "**Ada:** Why notes?",
      "**Bob:** Because they grow.",
      "Ada: And then?",
      "Bob: They bloom.",
      "Ada: Every one?",
      "Bob: The ones you tend.",
      "Ada: Thank you, Bob.",
    ])
    expect(guess(md)).toEqual({ layout: "dialogue", score: 7 / 8, reason: "7 of 8 paragraphs start with a speaker's name" })
    // An interview of two lines is not enough to tell.
    expect(layoutOf(paragraphs(["**Ada:** Why?", "**Bob:** Because.", "And then the essay goes on, at length."]))).toBeUndefined()
    // Q and A are a FAQ's, and terms said once each are a glossary's.
    expect(layoutOf(paragraphs(Array.from({ length: 4 }, () => ["Q: Why?", "A: Because."]).flat()))).toBeUndefined()
  })

  test("a wall of quotes, but not an essay quoting once", () => {
    const md = paragraphs([
      "Lines worth keeping.",
      "> Simplicity is prerequisite for reliability.\n>\n> — Edsger Dijkstra",
      "> Make it work, make it right, make it fast.\n> — Kent Beck",
      "> Premature optimization is the root of all evil.\n> — Donald Knuth",
      "> Talk is cheap. Show me the code.\n> — Linus Torvalds",
    ])
    expect(guess(md)).toEqual({ layout: "quotes", score: 4 / 5, reason: '4 of 5 blocks are quotes signed "— Name"' })
    expect(layoutOf(essay)).toBeUndefined()
    // Three quotes in a long essay are still an essay.
    expect(layoutOf(essay + "\n\n" + essay + "\n\n" + essay)).toBeUndefined()
  })

  test("a checklist, but not prose with one task list", () => {
    const tasks = Array.from({ length: 6 }, (_, i) => `- [${i % 2 ? "x" : " "}] Pack item ${i + 1}`).join("\n")
    expect(guess(`Before leaving:\n\n${tasks}`)).toEqual({ layout: "checklist", score: 6 / 7, reason: "6 of 7 items and paragraphs are tasks" })
    expect(layoutOf(`${essay}\n\n${tasks}\n\n${essay}`)).toBeUndefined()
    // Four tasks are a to-do, not a checklist.
    expect(layoutOf("- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d")).toBeUndefined()
  })

  test("a changelog: sections named by versions", () => {
    const md =
      "All notable changes.\n\n## [Unreleased]\n\n- More\n\n## [1.1.0] - 2026-02-01\n\n### Added\n\n- Things\n\n## 1.0.1\n\n- Fix\n\n## 1.0.0 - 2026-01-01\n\n- First"
    expect(guess(md)).toEqual({ layout: "changelog", score: 1, reason: '4 of 4 sections are versions, such as "Unreleased"' })
    expect(layoutOf("## 1.0.0\n\nA\n\n## 2.0.0\n\nB\n\n## Why\n\nC\n\n## How\n\nD")).toBeUndefined()
  })

  test("a timeline: sections named by years or dates, in order", () => {
    const md = "How I got here.\n\n## 2015\n\nFirst program.\n\n## 2018 — Hanoi\n\nMoved.\n\n## March 2020\n\nThe garden.\n\n## 2024-05-01\n\nThis site."
    expect(guess(md)).toEqual({ layout: "timeline", score: 1, reason: "4 of 4 sections are dated, in order" })
    expect(layoutOf(md.replace("## 2018", "## 2028"))).toBeUndefined()
    // Newest first is a timeline too.
    expect(layoutOf("## 2024\n\nA\n\n## 2020\n\nB\n\n## 2010\n\nC\n\n## 1999\n\nD")).toBe("timeline")
  })

  test("a FAQ: sections that are questions", () => {
    expect(guess("## Why a garden?\n\nA\n\n## Can I reuse it?\n\nB\n\n## Is it free？\n\nC")).toEqual({
      layout: "faq",
      score: 1,
      reason: "3 of 3 sections are questions",
    })
    expect(layoutOf("## Why a garden?\n\nA\n\n## Setup\n\nB\n\n## Is it free?\n\nC\n\n## Usage\n\nD")).toBeUndefined()
  })

  test("a comparison: options with pros and cons", () => {
    const md = "## Obsidian\n\n- ✅ Local files\n- ❌ Closed source\n\n## Logseq\n\n+ Open source\n- Slower\n\n## Notion\n\nIn the cloud."
    expect(guess(md)).toEqual({ layout: "compare", score: 2 / 3, reason: "2 of 3 sections list pros and cons" })
    expect(layoutOf("## Obsidian\n\n- ✅ Local files\n- ❌ Closed source\n\n## Others\n\n- ✅ Fine")).toBeUndefined()
  })

  test("a glossary: paragraphs defining terms in bold, each once", () => {
    const terms = ["Atomic note", "Backlink", "Evergreen", "Fleeting note", "Zettel"].map((t) => `**${t}**: what ${t.toLowerCase()} means.`)
    expect(guess(paragraphs(["Words of the garden.", ...terms]))).toEqual({
      layout: "glossary",
      score: 5 / 6,
      reason: "5 of 6 paragraphs define a term in bold",
    })
    expect(layoutOf(paragraphs([essay, terms[0], essay]))).toBeUndefined()
  })

  test("reading highlights: quotes and items with a location", () => {
    const md =
      "## Highlights\n\n> Writing is not what follows research. (Location 123)\n\n- Notes are valuable in context. (p. 45)\n- A third one ([Location 200](https://readwise.io/to_kindle?location=200))\n- A plain one."
    expect(guess(md)).toEqual({ layout: "highlights", score: 3 / 4, reason: "3 of 4 quotes and items give a location or page" })
    expect(layoutOf(`${essay}\n\n- See p. 45\n- (p. 46)`)).toBeUndefined()
  })

  test("a paper: authors with a DOI or an arXiv id", () => {
    expect(guess("Text.", { authors: ["Ada"], doi: "10.1/x" })).toEqual({ layout: "paper", score: 0.9, reason: "has authors and a DOI" })
    expect(guess("## Abstract\n\nWe show.", { author: "Ada", arxiv: "2401.0001" })).toEqual({
      layout: "paper",
      score: 1,
      reason: "has authors and an arXiv id, and an abstract",
    })
    expect(layoutOf("Text.", { doi: "10.1/x" })).toBeUndefined()
  })

  test("a decision record: a decision's status, and its context and decision", () => {
    const md = "## Context\n\nSearch is slow.\n\n## Decision\n\nUse an index.\n\n## Consequences\n\nFaster."
    expect(guess(md, { status: "Accepted" })).toEqual({
      layout: "decision",
      score: 0.9,
      reason: 'has status "Accepted" and Context, Decision, Consequences sections',
    })
    expect(layoutOf(md, { status: "reading" })).toBeUndefined()
    expect(layoutOf("## Context\n\nA\n\n## Notes\n\nB", { status: "accepted" })).toBeUndefined()
  })

  test("a letter: a place and a date, and a signature or a greeting", () => {
    const md = "Dear Bob,\n\nThank you for the seeds.\n\nYours,\nAda"
    expect(guess(md, { place: "Hanoi", date: "2026-03-01" })).toEqual({ layout: "letter", score: 0.85, reason: "has a place, a date and a greeting" })
    expect(guess("Thanks.", { place: "Hanoi", date: "2026-03-01", signature: "Ada" })).toEqual({
      layout: "letter",
      score: 0.95,
      reason: "has a place, a date and a signature",
    })
    expect(layoutOf("A trip report.", { place: "Hanoi", date: "2026-03-01" })).toBeUndefined()
    expect(layoutOf(md, { date: "2026-03-01" })).toBeUndefined()
  })

  test("a poem: stanzas of short lines", () => {
    const stanza = "The road goes on and on,\npast the hedge and the stone,\nwhere the hawthorn grows,\nand the river knows."
    expect(guess(`# Road\n\n${stanza}\n\n${stanza}`)).toEqual({ layout: "poem", score: 1, reason: "8 short lines in 2 stanzas" })
    // A list written as lines is not a poem, nor is prose, nor a poem quoted in an essay.
    expect(layoutOf("Milk\nEggs\nBread\nTea\n\nRice\nSalt\nOil\nSugar")).toBeUndefined()
    expect(layoutOf(essay)).toBeUndefined()
    expect(layoutOf(`${stanza}\n\n${stanza}\n\n- a list`)).toBeUndefined()
    expect(layoutOf(`${stanza}\n\n${stanza.replace("road", "long and winding road that runs from the hills all the way down")}`)).toBeUndefined()
    expect(layoutOf(`${stanza}\n\nOne line.`)).toBeUndefined()
  })

  test("a recipe card: an ingredients list and numbered steps", () => {
    const md = "## Ingredients\n\n- Flour\n- Milk\n\n## Steps\n\n1. Mix\n2. Fry"
    expect(guess(md)).toEqual({ layout: "recipe-card", score: 0.9, reason: "has an Ingredients list and numbered steps" })
    expect(layoutOf("## Ingredients\n\n- Flour\n\n## Steps\n\nMix and fry.")).toBeUndefined()
  })

  test("an ordinary note gets nothing; of two layouts, the one that fits better wins", () => {
    expect(layoutOf(essay)).toBeUndefined()
    expect(layoutOf("")).toBeUndefined()
    const fm = { authors: "Ada", doi: "10.1/x" }
    expect(layoutOf("## Why?\n\nA\n\n## How?\n\nB\n\n## What?\n\nC", fm)).toBe("faq")
    expect(layoutOf("## Abstract\n\nA\n\n## Why?\n\nA\n\n## How?\n\nB\n\n## What?\n\nC\n\n## Who?\n\nD", fm)).toBe("paper")
  })

  test("links keep their words, and embeds and locked parts stay out", () => {
    const r = readNote('**<a href="/ada" class="internal">Ada</a>:** hi\n\n<div class="locked-part" data-lock="0"></div>')
    expect(r.html).toContain("<strong>Ada:</strong> hi")
    expect(r.html).not.toContain("locked")
  })

  test("layout: none, or any layout, asks for no suggestion", () => {
    expect(asksLayout({ layout: "none" })).toBe(true)
    expect(asksLayout({ layout: "quotes" })).toBe(true)
    expect(asksLayout({ layout: " " })).toBe(false)
    expect(asksLayout({})).toBe(false)
  })
})

/** A note as suggestLayouts reads it. */
function note(key: string, fm: Record<string, unknown> = {}, md = "Some text.", over: Partial<Note> = {}): Note {
  const dir = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : ""
  return { key, lang: "en-US", dir, md, protected: false, unlisted: false, isHome: false, deck: false, source: { key, fm, dir }, ...over } as unknown as Note
}

/** A vault of these notes, foldered as the vault does it. */
function vaultOf(notes: Note[]): Pick<Vault, "notes" | "folders"> {
  const folders = new Map<string, FolderNode>()
  for (const n of notes) {
    const segment = n.dir.split("/").pop()!
    const f = folders.get(n.dir) ?? { segment, name: segment, dir: n.dir, url: "", folders: [], notes: [] }
    folders.set(n.dir, f)
    if (n.dir && n.key.split("/").pop() === segment) f.folderNote = n
    else f.notes.push(n)
  }
  return { notes: { "en-US": notes }, folders: { "en-US": folders } }
}

const books = (dir: string, n = 5) => Array.from({ length: n }, (_, i) => note(`${dir}/Book ${i}`, { author: "Ada", rating: 4 }))

describe("folders whose notes fit a collection", () => {
  test("the share of notes with a collection's properties", () => {
    expect(guessCollection(books("Reading"))).toEqual({ layout: "books", score: 1, reason: "5 of 5 notes have an author and a rating, ISBN or page count" })
    expect(guessCollection([...books("Reading", 4), note("Reading/Essay")])).toMatchObject({ layout: "books", score: 0.8 })
    // Three books are too few to tell, and four in seven too few a share.
    expect(guessCollection(books("Reading", 3))).toBeUndefined()
    expect(guessCollection([...books("Reading", 4), note("a"), note("b"), note("c")])).toBeUndefined()
  })

  test("each collection's properties", () => {
    const fit = (fm: Record<string, unknown>, md = "Text.", key = "F/n") =>
      guessCollection(Array.from({ length: 4 }, (_, i) => note(`${key}${i + 1}`, fm, md)))?.layout
    expect(fit({ number: 3, audio: "https://x.org/a.mp3" })).toBe("episodes")
    expect(fit({ price: "$12" })).toBe("wishlist")
    expect(fit({}, "Text.", "Journal/2026-01-0")).toBe("daily")
    expect(fit({ director: "Ozu" })).toBe("movies")
    expect(fit({ author: "Ada", isbn: "978" })).toBe("books")
    expect(fit({ event: "FOSDEM", date: "2026-02-01" })).toBe("talks")
    expect(fit({ provider: "Coursera", progress: "40%" })).toBe("courses")
    expect(fit({ platform: "edX", instructor: "Ada" })).toBe("courses")
    expect(fit({ role: "Engineer", company: "ACME" })).toBe("people")
    expect(fit({ language: "bash" }, "```bash\nls\n```")).toBe("snippets")
    expect(fit({ servings: 2 })).toBe("recipes")
    expect(fit({}, "## Ingredients\n\n- Flour")).toBe("recipes")
    expect(fit({ location: "21.0, 105.8" })).toBe("places")
    expect(fit({ repo: "https://git.example/x" })).toBe("projects")
    expect(fit({ start: "2024", status: "active" })).toBe("projects")
    expect(fit({ source: "https://example.org/post", author: "Bob" })).toBe("bookmarks")
    // An author alone, a language without code, or a page without a URL say nothing.
    expect(fit({ author: "Ada" })).toBeUndefined()
    expect(fit({ language: "bash" })).toBeUndefined()
    expect(fit({ source: "Kindle" })).toBeUndefined()
  })
})

describe("suggestLayouts", () => {
  const dialogue = paragraphs(Array.from({ length: 4 }, () => ["**Ada:** Why?", "**Bob:** Because."]).flat())

  test("notes and folders, sorted by file; a folder without a folder note names the one to create", () => {
    const hints = suggestLayouts(vaultOf([note("Talk", {}, dialogue), ...books("Reading"), note("Reading/Reading"), ...books("Shelf")]), "en-US")
    expect(hints.map((h) => [h.file, h.layout, h.folder, h.create])).toEqual([
      ["Reading/Reading.md", "books", "Reading", undefined],
      ["Shelf/Shelf.md", "books", "Shelf", true],
      ["Talk.md", "dialogue", undefined, undefined],
    ])
  })

  test("notes asking for a layout or none, protected ones, days, decks, boards and slides get none", () => {
    const notes = [
      note("None", { layout: "none" }, dialogue),
      note("Unknown", { layout: "chat" }, dialogue),
      note("Locked", {}, dialogue, { protected: true }),
      note("2026-01-02", {}, dialogue),
      note("Deck", {}, dialogue, { deck: true }),
      note("Slides", {}, dialogue, { slides: {} }),
      note("Board", { "kanban-plugin": "basic" }, dialogue),
    ]
    expect(suggestLayouts(vaultOf(notes), "en-US")).toEqual([])
  })

  test("a folder is left alone when its note opts out or is protected, or a collection already lists it", () => {
    const listing = (key: string, layout: Note["layout"], from?: string) => note(key, { layout, ...(from ? { from } : {}) }, "", { layout })
    const vault = vaultOf([
      ...books("A"),
      note("A/A", { layout: "none" }),
      ...books("B"),
      note("B/B", {}, "", { protected: true }),
      ...books("C/Old"),
      listing("C/C", "books"),
      ...books("D"),
      listing("Elsewhere", "projects", "D"),
      ...books("E"),
      listing("Digest", "digest"),
      ...books("F"),
      note("F/Locked", { author: "Ada", rating: 4 }, "", { protected: true }),
    ])
    // A digest lists weeks, not folders; F's protected note is not counted.
    const reason = "5 of 5 notes have an author and a rating, ISBN or page count"
    expect(
      suggestLayouts(vault, "en-US")
        .filter((h) => h.folder)
        .map((h) => [h.folder, h.reason]),
    ).toEqual([
      ["E", reason],
      ["F", reason],
    ])
  })

  test("the report gives the line to add, and says when there is none", () => {
    const hints: LayoutHint[] = [
      { file: "Shelf/Shelf.md", layout: "books", score: 0.9, reason: "9 of 10 notes have an author", folder: "Shelf", create: true },
      { file: "Talk.md", layout: "dialogue", score: 0.875, reason: "7 of 8 paragraphs start with a speaker's name" },
    ]
    expect(formatHints(hints)).toBe(
      [
        "Shelf/Shelf.md  (new folder note)",
        "  layout: books        lists Shelf/ as a collection: 9 of 10 notes have an author (90%)",
        "Talk.md",
        "  layout: dialogue     7 of 8 paragraphs start with a speaker's name (88%)",
        "",
        '2 suggestions. Add the line to the note\'s frontmatter, or "layout: none" to keep it as it is.',
      ].join("\n"),
    )
    expect(formatHints(hints.slice(1))).toEndWith('\n\n1 suggestion. Add the line to the note\'s frontmatter, or "layout: none" to keep it as it is.')
    expect(formatHints([])).toBe("No layout to suggest.")
  })
})

// End-to-end: a vault with a protected note, a draft and a private note that would each be suggested a layout.
describe("datme check --suggest", () => {
  const root = path.resolve(import.meta.dir, "..")
  const vault = path.join(root, "tests/fixtures/hints")
  const suggest = (...flags: string[]) => {
    const proc = Bun.spawnSync(["bun", "bin/datme.ts", "check", vault, ...flags], {
      cwd: root,
      env: { ...process.env, DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
      stdout: "pipe",
      stderr: "pipe",
    })
    return { code: proc.exitCode, out: proc.stdout.toString() }
  }

  test("lists only what is published and readable", () => {
    const { code, out } = suggest("--suggest", "--json")
    expect(code).toBe(0)
    const hints = JSON.parse(out) as LayoutHint[]
    expect(hints.map((h) => `${h.file} ${h.layout}`)).toEqual(["Interview.md dialogue", "Reading/Reading.md books"])
    // A protected note's text, a draft and a private note are never read.
    expect(out).not.toContain("Locked")
    expect(out).not.toContain("Draft")
    expect(out).not.toContain("Private")
  })

  test("--drafts reads drafts too", () => {
    expect(suggest("--suggest", "--drafts").out).toContain("Draft interview.md\n  layout: dialogue")
  })

  test("suggestions are notices: --verbose lists them, and they never fail --strict", () => {
    const { code, out } = suggest("--strict", "--verbose")
    expect(code).toBe(0)
    expect(out).toContain("  info    suggested layout: dialogue: 8 of 9 paragraphs start with a speaker's name")
    expect(out).toContain(
      "Reading\n  info    suggested layout: books, listing Reading/ as a collection from a new folder note Reading/Reading.md: 5 of 5 notes",
    )
  })
})
