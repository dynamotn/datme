import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import path from "node:path"
import { site, loadConfig, type SiteConfig } from "../src/site.config"
import { getVault, type Note } from "../src/lib/vault"
import {
  basesOf,
  collectionKindOf,
  collectionOf,
  field,
  galleryHtml,
  isCollection,
  itemOf,
  layoutHtml,
  linksOf,
  periodOf,
  placesOf,
  plain,
  quotesHtml,
  ratingOf,
  recipeFacts,
  runBase,
  sourcesOf,
  specOf,
  statusLabelOf,
  whenOf,
  withoutBases,
  type Collection,
} from "../src/lib/note-layouts"

/**
 * The collection logic reads the published vault, so these tests point the
 * site at a vault of their own for the length of this file, then put the
 * fixture vault back.
 */
const VAULT = path.resolve(import.meta.dir, "fixtures/cov-b/forkA-layouts")
const g = globalThis as { __vaultVersion?: number }
let saved: SiteConfig

beforeAll(() => {
  saved = { ...site }
  Object.assign(site, loadConfig(VAULT, {}))
  g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
})

afterAll(() => {
  for (const k of Object.keys(site)) if (!(k in saved)) delete (site as unknown as Record<string, unknown>)[k]
  Object.assign(site, saved)
  g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
})

const lang = "en-US"
const note = (key: string): Note => {
  const n = getVault().byKey[lang].get(key)
  if (!n) throw new Error(`no note ${key}`)
  return n
}
/** A published note with other frontmatter (and markdown), as if written so. */
const withFm = (key: string, fm: Record<string, unknown>, extra: Partial<Note> = {}): Note => {
  const n = note(key)
  return { ...n, ...extra, source: { ...n.source, fm } }
}
const groupsOf = (key: string) => {
  const n = note(key)
  return collectionOf(n, specOf(n, n.layout as Collection)).map((gr) => [gr.key, gr.label, gr.notes.map((x) => x.key)])
}

describe("collection specs", () => {
  test("isCollection knows the collection layouts only", () => {
    expect(isCollection("books")).toBe(true)
    expect(isCollection("gallery")).toBe(false)
    expect(isCollection(undefined)).toBe(false)
  })

  test("the preset of a kind, unless the note names its own statuses, group and fields", () => {
    const books = specOf(note("Books"), "books")
    expect(books.look).toBe("shelf")
    expect(books.group).toBe("status")
    expect(books.fields).toEqual(["author|authors", "year|published"])
    expect(books.statuses.map((s) => s.key)).toEqual(["reading", "to-read", "read", "abandoned"])
    // Places have no statuses of their own.
    expect(specOf(note("Places"), "places").statuses).toEqual([])

    const shelf = specOf(note("Shelf"), "shelf")
    // An empty group falls back to the preset's.
    expect(shelf.group).toBe("status")
    expect(shelf.fields).toEqual(["platform"])
    // A label per language, the first language when this one is missing, the key when empty.
    expect(shelf.statuses).toEqual([
      { key: "playing", label: "Playing now", spellings: ["playing"] },
      { key: "backlog", label: "Plus tard", spellings: ["backlog"] },
      { key: "wishlist", label: "wishlist", spellings: ["wishlist"] },
    ])
    expect(specOf(withFm("Books", { fields: ["a", 1], group: "year" }), "books")).toMatchObject({ fields: ["a", "1"], group: "year" })
  })
})

describe("frontmatter values", () => {
  test("plain text of dates, objects, lists and wikilinks", () => {
    expect(plain(null)).toBe("")
    expect(plain(new Date("2024-05-06T10:00:00Z"))).toBe("2024-05-06")
    expect(plain({ a: 1 })).toBe("")
    expect(plain(["", "[[x/y]]", 3])).toBe("y, 3")
  })

  test("field takes the first of its names that has a value", () => {
    expect(field(note("Reading/Alpha"), "authors|author")).toBe("Ann Author")
    expect(field(note("Reading/Alpha"), "nope|none")).toBe("")
  })

  test("sources: tags, folders trimmed of slashes, else the note's own folder", () => {
    expect(sourcesOf(note("Books"))).toEqual({ folders: ["Reading"], tags: ["book"] })
    expect(sourcesOf(note("Places"))).toEqual({ folders: ["Travel"], tags: [] })
    expect(sourcesOf(note("Talks/Talks"))).toEqual({ folders: ["Talks"], tags: [] })
    expect(sourcesOf(withFm("Talks/Talks", { from: "" }))).toEqual({ folders: ["Talks"], tags: [] })
  })

  test("when: the end first, a bare year as its first day, bad dates skipped, else the creation date", () => {
    expect(whenOf(note("Reading/Beta"))?.toISOString()).toBe("2021-01-01T00:00:00.000Z")
    expect(whenOf(withFm("Plain", { end: "", finished: "not a date", date: "2022-02-02" }))?.toISOString()).toBe("2022-02-02T00:00:00.000Z")
    const created = new Date("2000-01-01")
    expect(whenOf({ ...withFm("Plain", { date: "garbage" }), created })).toBe(created)
    expect(whenOf({ ...withFm("Plain", {}), created: undefined })).toBeUndefined()
  })

  test("the years a project ran", () => {
    expect(periodOf(note("Projects/Garden"), lang)).toBe("2021 – 2023")
    expect(periodOf(note("Projects/Paused"), lang)).toBe("2024 – now")
    expect(periodOf(withFm("Plain", {}), lang)).toBeUndefined()
    expect(periodOf(withFm("Plain", { finished: 2020 }), lang)).toBe("2020")
    expect(periodOf(withFm("Plain", { start: "2020-03-01", end: "2020-12-01" }), lang)).toBe("2020")
    expect(periodOf(withFm("Plain", { start: "spring", end: "" }), lang)).toBe("spring – now")
  })

  test("ratings capped at the configured scale", () => {
    expect(ratingOf(note("Reading/Alpha"))).toBe(3)
    expect(ratingOf(note("Reading/Beta"))).toBe(site.conventions.ratingScale)
    expect(ratingOf(note("Plain"))).toBeUndefined()
    expect(ratingOf(withFm("Plain", { rating: "great" }))).toBeUndefined()
  })

  test("status labels: known spellings translated, others as written", () => {
    expect(statusLabelOf(note("Reading/Beta"), "books")).toBe("Read")
    expect(statusLabelOf(note("Reading/Delta"), "books")).toBe("Weird")
    expect(statusLabelOf(note("Plain"), "books")).toBeUndefined()
    // Talks have no statuses of their own.
    expect(statusLabelOf(withFm("Plain", { status: "done" }), "talks")).toBe("done")
  })

  test("links: talk links labelled, other URLs by host, duplicates and non-URLs dropped", () => {
    expect(linksOf(note("Talks/Conf"))).toEqual([
      { label: "Slides", href: "https://slides.example/conf" },
      { label: "Video", href: "https://video.example/conf" },
      { label: "Paper", href: "https://www.paper.example/p" },
      { label: "github.com", href: "https://github.com/example/conf" },
      { label: "Mirror", href: "https://mirror.example/conf" },
    ])
    expect(linksOf(withFm("Plain", { demo: "https://www.demo.example/", links: ["https://a.example", 42] }))).toEqual([
      { label: "demo.example", href: "https://www.demo.example/" },
      { label: "a.example", href: "https://a.example" },
    ])
    expect(linksOf(note("Plain"))).toEqual([])
  })

  test("recipe facts", () => {
    expect(recipeFacts(note("Recipes/Soup"))).toEqual(["⏱ 6 h", "🍽 4"])
    expect(recipeFacts(note("Plain"))).toEqual([])
  })
})

describe("collections", () => {
  test("by status, in reading order, statuses not known by name, then notes without one", () => {
    expect(groupsOf("Books")).toEqual([
      ["reading", "Reading", ["Reading/Alpha"]],
      ["read", "Read", ["Reading/Beta"]],
      ["odd", "Odd", ["Reading/Epsilon"]],
      ["weird", "Weird", ["Reading/Delta"]],
      ["", "Other", ["Reading/Gamma"]],
    ])
  })

  test("projects by status from their own folder, the collection itself left out", () => {
    expect(groupsOf("Projects/Projects")).toEqual([
      ["active", "In progress", ["Projects/Garden"]],
      ["paused", "Paused", ["Projects/Paused"]],
    ])
  })

  test("talks by year, newest first", () => {
    expect(groupsOf("Talks/Talks")).toEqual([
      ["2024", "2024", ["Talks/Conf", "Talks/Workshop"]],
      ["2023", "2023", ["Talks/Meetup"]],
    ])
    // A note with no date at all goes last, under "Other".
    const talks = note("Talks/Talks")
    const undated = { ...withFm("Plain", {}), created: undefined }
    const spec = { ...specOf(talks, "talks"), group: "year" }
    const vault = getVault()
    const list = vault.notes[lang]
    list.push({ ...undated, key: "Talks/Undated", dir: "Talks" })
    try {
      const groups = collectionOf(talks, spec)
      expect(groups.at(-1)).toMatchObject({ key: "", label: "Other" })
      expect(groups.at(-1)!.notes.map((n) => n.key)).toEqual(["Talks/Undated"])
    } finally {
      list.pop()
    }
  })

  test("places by a property; their map takes notes with a location", () => {
    const groups = collectionOf(note("Places"), specOf(note("Places"), "places"))
    expect(groups.map((gr) => [gr.key, gr.label])).toEqual([
      ["japan", "Japan"],
      ["vietnam", "Vietnam"],
      ["", "Other"],
    ])
    expect(placesOf(groups)).toEqual([
      { lat: 35.01, lng: 135.77, title: "Kyoto", url: note("Travel/Kyoto").url, description: undefined },
      { lat: 11.94, lng: 108.44, title: "Dalat", url: note("Travel/Dalat").url, description: undefined },
    ])
  })

  test("a shelf names its own statuses", () => {
    expect(groupsOf("Shelf")).toEqual([
      ["playing", "Playing now", ["Games/Hades"]],
      ["backlog", "Plus tard", ["Games/Celeste"]],
    ])
  })

  test("group none: one unnamed group, or nothing at all", () => {
    expect(groupsOf("Everything")).toEqual([["", "", ["Watching/Stalker"]]])
    expect(groupsOf("Empty/Nothing")).toEqual([])
  })

  test("a base's own groups win, its empty value as Other", () => {
    expect(groupsOf("By base")).toEqual([
      ["read", "Read", ["Reading/Beta"]],
      ["odd", "Odd", ["Reading/Epsilon"]],
      ["reading", "Reading", ["Reading/Alpha"]],
      ["weird", "Weird", ["Reading/Delta"]],
      ["", "Other", ["Reading/Gamma"]],
    ])
  })

  test("a sorted base view keeps its order", () => {
    const n = note("By base")
    const md = n.md.replace('data-view=""', 'data-view="Sorted"')
    const sorted = { ...n, md }
    const [ref] = basesOf(sorted)
    expect(ref.view).toBe("Sorted")
    const res = runBase(sorted, ref)
    expect(res.sorted).toBe(true)
    expect(res.groups).toBeUndefined()
    const keys = res.notes.map((x) => x.key)
    expect(keys).toEqual([...keys].sort().reverse())
    const groups = collectionOf(sorted, { ...specOf(n, "books"), group: "none" })
    expect(groups[0].notes.map((x) => x.key)).toEqual(keys)
  })

  test("bases: inline blocks and embeds; a missing file or a malformed base is skipped", () => {
    const plainNote = note("Plain")
    const md = [
      '<span class="base-ph" data-rel="Rated.base" data-view=""></span>',
      '<span class="base-ph" data-rel="Missing.base" data-view=""></span>',
      "```base\nviews: [[[\n```",
      "```base\nviews: []\n```",
    ].join("\n")
    const refs = basesOf({ ...plainNote, md })
    expect(refs).toHaveLength(2)
    expect(refs[0].view).toBeUndefined()
    expect(refs[1].base.views).toEqual([])
    // A base without a view finds nothing.
    expect(runBase(plainNote, refs[1])).toEqual({ notes: [], sorted: false })
  })

  test("which collection a note belongs to; a protected collection claims none", () => {
    expect(collectionKindOf(note("Reading/Alpha"))).toBe("books")
    expect(collectionKindOf(note("Talks/Conf"))).toBe("talks")
    // Stalker is in the locked movies collection, and in the open projects one.
    expect(collectionKindOf(note("Watching/Stalker"))).toBe("projects")
    expect(collectionKindOf(note("Plain"))).toBeUndefined()
  })
})

describe("items", () => {
  test("what a note of each kind shows at its head", () => {
    expect(itemOf(note("Reading/Alpha"))).toEqual({
      kind: "books",
      upright: true,
      byline: ["Ann Author", "2020"],
      rating: 3,
      status: "Reading",
      links: [],
    })
    expect(itemOf(note("Projects/Garden"))).toMatchObject({ kind: "projects", upright: false, byline: ["2021 – 2023", "Lead"], status: "In progress" })
    expect(itemOf(note("Recipes/Soup"))).toMatchObject({ kind: "recipes", byline: ["⏱ 6 h", "🍽 4"] })
    expect(itemOf(note("Talks/Meetup"))).toMatchObject({ kind: "talks", byline: ["Mar 1, 2023", "Hanoi meetup"] })
    expect(itemOf(withFm("Talks/Meetup", { venue: "Somewhere" }))).toMatchObject({ byline: ["Somewhere"] })
    expect(itemOf(note("Travel/Kyoto"))).toMatchObject({ kind: "places", byline: ["Kyoto", "Japan", "Apr 1, 2024"] })
    expect(itemOf(note("Travel/Dalat"))).toMatchObject({ kind: "places", byline: ["Lam Dong", "Vietnam"] })
    expect(itemOf(note("Games/Hades"))).toMatchObject({ kind: "shelf", upright: true, status: "playing" })
  })

  test("a note with a cover outside any collection is shown like a shelf item", () => {
    expect(itemOf(note("Loose"))).toEqual({ kind: undefined, upright: true, byline: ["Someone", "1999"], rating: undefined, status: "Shelved", links: [] })
    expect(itemOf(withFm("Loose", { cover: "x.png" }))).toMatchObject({ status: undefined, byline: [] })
  })

  test("no item for plain notes, collections, layouts or protected notes", () => {
    expect(itemOf(note("Plain"))).toBeUndefined()
    expect(itemOf(note("Books"))).toBeUndefined()
    expect(itemOf({ ...note("Reading/Alpha"), protected: true })).toBeUndefined()
  })
})

describe("layouts of a note's own text", () => {
  test("a gallery joins the covers its base finds to its own pictures", () => {
    const n = note("Covers")
    const html = `<p>Covers.</p><div class="base-embed"><div>table</div></div><p><img src="/a.png" alt=""></p>`
    const out = layoutHtml(n, html)
    expect(out).not.toContain("base-embed")
    // The covers make one grid, the picture after the base another.
    expect(out.match(/<div class="gallery-grid">/g)).toHaveLength(2)
    expect(out).toContain(`<figure class="gallery-item"><a class="internal" href="${note("Reading/Alpha").url}" data-key="Reading/Alpha" tabindex="-1" aria-hidden="true"><img src="/assets/_assets/cover.png" alt="" loading="lazy"></a>`)
    // A second rendered base with no base behind it, and a base finding no covers, leave nothing.
    const none = layoutHtml({ ...n, md: "```base\nfilters: 'file.inFolder(\"Talks\")'\n```" }, `<div class="base-embed">x</div><div class="base-embed">y</div>`)
    expect(none).toBe("")
  })

  test("a timeline of the notes its base finds, oldest first", () => {
    const n = note("Log")
    const out = layoutHtml(n, `<p>Intro</p><div class="base-embed x"><div><div>rows</div></div></div><div class="base-embed">extra</div>`)
    const dates = [...out.matchAll(/<time datetime="([^"]+)">/g)].map((m) => m[1].slice(0, 10))
    // The talks, then the collection note itself, dated by its creation.
    expect(dates.slice(0, 3)).toEqual(["2023-03-01", "2024-01-15", "2024-09-10"])
    expect(dates).toHaveLength(4)
    expect(out).toStartWith("<p>Intro</p><ol class=\"life-timeline\">")
    expect(out).not.toContain("extra")
    // A note's description follows its title.
    const described = { ...n, md: "```base\nfilters: 'file.inFolder(\"Reading\")'\nviews:\n  - type: table\n    sort:\n      - property: file.name\n```" }
    const html = layoutHtml(described, `<div class="base-embed"></div>`)
    expect(html).toContain("Alpha</a> — First book.</p>")
    // Sorted by the base, not by date: Alpha (2020) before Beta (2021) before Delta (2018).
    const titles = [...html.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1])
    expect(titles).toEqual(["Reading/Alpha", "Reading/Beta", "Reading/Delta", "Reading/Epsilon", "Reading/Gamma"])
    // A base finding nothing leaves the timeline of the note's own text.
    expect(layoutHtml({ ...n, md: "```base\nfilters: 'file.inFolder(\"Nowhere\")'\n```" }, `<h2>2015</h2><p>x</p><div class="base-embed"></div>`)).toBe(
      `<ol class="life-timeline"><li class="life-event"><h2>2015</h2><div class="life-body"><p>x</p></div></li></ol>`,
    )
  })

  test("every other layout reshapes the text its own way", () => {
    const n = note("Plain")
    const at = (layout: Note["layout"], html: string) => layoutHtml({ ...n, layout }, html)
    expect(at("cv", "<h2>A</h2><p>x</p>")).toContain('class="cv-section"')
    expect(at("links", '<ul><li><a href="/a">A</a></li></ul>')).toContain("link-hub")
    expect(at("uses", "<ul><li><strong>A</strong></li></ul>")).toContain("uses-grid")
    expect(at("faq", "<h2>Q</h2><p>A</p>")).toContain('class="faq-item"')
    expect(at("quotes", "<blockquote><p>Q</p></blockquote>")).toContain("quote-wall")
    expect(at("books", '<p>a</p><div class="base-embed">x</div>')).toBe("<p>a</p>")
    expect(at("now", "<p>same</p>")).toBe("<p>same</p>")
    expect(at(undefined, "<p>same</p>")).toBe("<p>same</p>")
  })

  test("a recipe of a collection gets its two columns", () => {
    const out = layoutHtml(note("Recipes/Soup"), "<h2>Ingredients</h2><ul><li>Bones</li></ul><h2>Steps</h2>")
    expect(out).toContain('<aside class="recipe-ingredients">')
  })

  test("a base div left open runs to the end", () => {
    expect(withoutBases(`<p>a</p><div class="base-embed"><div>never closed`)).toBe("<p>a</p>")
  })

  test("blank lines between picture paragraphs keep one grid; a quote wall stays one wall", () => {
    expect(galleryHtml(`<p><img src="/a.png"></p>\n<p><img src="/b.png"></p>`).match(/gallery-grid/g)).toHaveLength(1)
    expect(quotesHtml(`<blockquote><p>A</p></blockquote>\n<blockquote><p>B</p></blockquote>`).match(/quote-wall/g)).toHaveLength(1)
  })
})
