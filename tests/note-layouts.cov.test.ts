import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import path from "node:path"
import { site, loadConfig, type SiteConfig } from "../src/site.config"
import { getVault, type Note } from "../src/lib/vault"
import { renderNote, renderTranslation } from "../src/lib/markdown"
import { audioType, bookmarkOf, dailyDays, firstParagraph, initials, listOf, peopleTies, snippetOf, trackCharts, trackedOf } from "../src/lib/collection-views"
import { episodesFeed, episodesPath } from "../src/lib/feed"
import * as episodesRoute from "../src/pages/[...path]/episodes.xml"
import { noteProperties } from "../src/lib/properties"
import { releasesFeed } from "../src/lib/feed"
import {
  basesOf,
  collectionKindOf,
  collectionOf,
  decisionOf,
  field,
  galleryHtml,
  isCollection,
  itemOf,
  layoutHtml,
  lessonsOf,
  linksOf,
  loreLinksOf,
  loreTree,
  nameDay,
  noteDay,
  paperOf,
  periodOf,
  placesOf,
  plain,
  quotesHtml,
  ratingOf,
  recipeFacts,
  refsOf,
  relationsOf,
  releasesUrl,
  routeOf,
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
    expect(out).toContain(
      `<figure class="gallery-item"><a class="internal" href="${note("Reading/Alpha").url}" data-key="Reading/Alpha" tabindex="-1" aria-hidden="true"><img src="/assets/_assets/cover.png" alt="" loading="lazy"></a>`,
    )
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
    expect(out).toStartWith('<p>Intro</p><ol class="life-timeline">')
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

describe("collections of their own kind", () => {
  const keys = (key: string) => groupsOf(key).map(([k, label, notes]) => [k, label, (notes as string[]).sort()])

  test("a daily note's day: its date, else its name in the daily format or starting with a date", () => {
    expect(nameDay(note("Journal/2024-03-01"))).toBe("2024-03-01")
    expect(nameDay(note("Journal/2024-03-05 Standup"))).toBe("2024-03-05")
    expect(nameDay(note("Journal/2024-02-30"))).toBeUndefined()
    expect(nameDay(note("Journal/Undated"))).toBeUndefined()
    expect(noteDay(note("Journal/Retreat"))).toBe("2023-12-31")
    expect(noteDay(note("Journal/2024-03-02"))).toBe("2024-03-02")
    expect(whenOf(note("Journal/2024-03-05 Standup"))?.toISOString()).toBe("2024-03-05T00:00:00.000Z")
  })

  test("a journal by month, newest first; its days, tracked numbers and charts", () => {
    const groups = groupsOf("Journal/Journal")
    const dated = groups.filter(([k]) => (k as string) < "2025")
    expect(dated).toEqual([
      ["2024-03", "March 2024", ["Journal/2024-03-05 Standup", "Journal/2024-03-02", "Journal/2024-03-01"]],
      ["2023-12", "December 2023", ["Journal/Retreat"]],
    ])
    const j = note("Journal/Journal")
    const days = dailyDays(groups.flatMap(([, , n]) => (n as string[]).map(note)))
    expect([...days.keys()].sort()).toEqual(["2023-12-31", "2024-03-01", "2024-03-02", "2024-03-05"])
    const charts = trackCharts(j, days)
    // Steps are never written down: no chart for them.
    expect(charts).toHaveLength(2)
    expect(charts[0]).toContain('<th scope="col">mood</th>')
    expect(charts[0]).toContain('<tr><th scope="row">2023-12-31</th><td>5</td></tr>')
    expect(charts[0]).not.toContain("2024-03-02</th>")
    expect(charts[1]).toContain("<td>7.5</td>")
    expect(trackedOf(j, note("Journal/2024-03-01"))).toEqual(["mood 4", "sleep 7.5"])
    expect(trackedOf(j, note("Journal/Undated"))).toEqual([])
    expect(trackCharts(withFm("Journal/Journal", {}), days)).toEqual([])
  })

  test("a day of a journal keeps the usual page", () => {
    expect(collectionKindOf(note("Journal/2024-03-01"))).toBe("daily")
    expect(itemOf(note("Journal/2024-03-01"))).toBeUndefined()
  })

  test("bookmarks by status, with their site, logo, date and first paragraph", async () => {
    expect(keys("Clippings/Clippings")).toEqual([
      ["unread", "Unread", ["Clippings/Loose clip", "Clippings/Repo"]],
      ["archived", "Archived", ["Clippings/Essay"]],
    ])
    const repo = bookmarkOf(note("Clippings/Repo"))
    expect(repo).toMatchObject({ href: "https://github.com/example/repo", site: "github.com", letter: "G" })
    expect(repo.icon).toStartWith("M12")
    expect(repo.published?.toISOString()).toBe("2024-05-01T00:00:00.000Z")
    expect(bookmarkOf(note("Clippings/Essay"))).toEqual({
      href: "https://www.essays.example/one",
      site: "essays.example",
      icon: undefined,
      letter: "E",
      published: undefined,
    })
    expect(bookmarkOf(note("Clippings/Loose clip"))).toEqual({ letter: "L" })
    expect(bookmarkOf({ ...note("Clippings/Loose clip"), title: "" })).toEqual({ letter: "?" })
    expect(firstParagraph((await renderNote(note("Clippings/Repo"))).html)).toBe("Worth another look &#x26; more.")
    expect(firstParagraph((await renderNote(note("Clippings/Loose clip"))).html)).toBe("After the picture.")
    expect(firstParagraph("<h2>x</h2>")).toBe("")
    expect(itemOf(note("Clippings/Repo"))).toMatchObject({
      kind: "bookmarks",
      byline: ["Ann", "May 1, 2024"],
      status: "Unread",
      links: [{ label: "github.com", href: "https://github.com/example/repo" }],
    })
    expect(itemOf(note("Clippings/Essay"))).toMatchObject({ byline: [], status: "Archived" })
  })

  test("people by name, with their faces, roles and the links between them", () => {
    expect(keys("People/People")).toEqual([["", "", ["People/Ada Lovelace", "People/Alan Turing", "People/Grace Hopper"]]])
    expect(groupsOf("People/People")[0][2]).toEqual(["People/Ada Lovelace", "People/Alan Turing", "People/Grace Hopper"])
    const ada = note("People/Ada Lovelace")
    expect(ada.cover).toBe("/assets/_assets/cover.png")
    expect(specOf(note("People/People"), "people").fields).toEqual(["role|job|position", "org|company|organization|affiliation"])
    expect(itemOf(ada)).toMatchObject({
      kind: "people",
      round: true,
      byline: ["Mathematician", "Analytical Engine"],
      links: [{ label: "ada.example", href: "https://ada.example" }],
    })
    const people = ["People/Ada Lovelace", "People/Alan Turing", "People/Grace Hopper"].map(note)
    // Ada and Grace link both ways: one tie. Ada's link to Plain and the pilot's to Ada are not between people.
    expect(peopleTies(people).map(([a, b]) => [a.key, b.key].sort())).toEqual([["People/Ada Lovelace", "People/Grace Hopper"]])
    expect(initials("Ada King Lovelace")).toBe("AL")
    expect(initials("Ánh")).toBe("Á")
    expect(initials("")).toBe("")
  })

  test("snippets show their first code block and its language", async () => {
    const snip = async (key: string) => snippetOf(note(key), (await renderNote(note(key))).html)
    const ts = await snip("Snippets/Reverse")
    expect(ts.language).toBe("ts")
    expect(ts.code).toStartWith('<pre class="shiki')
    expect(ts.code).toEndWith("</pre>")
    expect((await snip("Snippets/Shell")).language).toBe("bash")
    expect((await snip("Snippets/Plain text")).language).toBe("")
    expect(await snip("Snippets/Words")).toEqual({ code: undefined, language: "" })
    expect(itemOf(note("Snippets/Shell"))).toMatchObject({ kind: "snippets", byline: ["bash"] })
  })

  test("episodes by season, else year, newest first, numbered", () => {
    expect(groupsOf("Podcast/Podcast")).toEqual([
      ["2022", "2022", ["Podcast/Old"]],
      ["1", "Season 1", ["Podcast/Second", "Podcast/Pilot"]],
      ["special", "special", ["Podcast/Bonus"]],
    ])
    const pilot = note("Podcast/Pilot")
    expect(pilot.audio).toEqual({ href: "/assets/_assets/pilot.mp3", file: "_assets/pilot.mp3" })
    expect(note("Podcast/Second").audio).toEqual({ href: "https://cdn.example/ep2.m4a?x=1" })
    expect(note("Podcast/Old").audio).toBeUndefined()
    expect(getVault().problems).toContainEqual({ level: "error", file: "Podcast/Old.md", message: 'audio "nope.mp3" is not in the vault' })
    expect(itemOf(pilot)).toMatchObject({ kind: "episodes", audio: "/assets/_assets/pilot.mp3", byline: ["#1", "Jan 10, 2024", "32:10", "Ada Lovelace"] })
    expect(itemOf(note("Podcast/Bonus"))).toMatchObject({ audio: undefined, byline: ["May 1, 2023"] })
    expect(audioType("/a/b.MP3")).toBe("audio/mpeg")
    expect(audioType("https://x.example/e.m4a?x=1#t")).toBe("audio/mp4")
    expect(audioType("https://x.example/stream")).toBe("audio/mpeg")
    expect(listOf("a, b")).toEqual(["a", "b"])
    expect(listOf(["[[a]]", ""])).toEqual(["a"])
  })

  test("a podcast feed of the episodes, with enclosures", async () => {
    const show = note("Podcast/Podcast")
    expect(episodesPath(show)).toBe("Podcast/Podcast/episodes.xml")
    expect(episodesPath({ ...show, slug: "index" })).toBe("episodes.xml")
    const xml = await (await episodesFeed(show)).text()
    expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"')
    expect(xml).toContain("<description>A show.</description>")
    expect(xml).toContain('<enclosure url="http://localhost:4321/assets/_assets/pilot.mp3" length="12" type="audio/mpeg"/>')
    expect(xml).toContain('<enclosure url="https://cdn.example/ep2.m4a?x=1" length="0" type="audio/mp4"/>')
    expect(xml).toContain("<itunes:duration>32:10</itunes:duration><itunes:episode>1</itunes:episode>")
    const order = ["The second", "The first", "A bonus", "From before"].map((x) => xml.indexOf(x))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    const noDescription = await (await episodesFeed({ ...show, description: undefined })).text()
    // Without a description, the site's tagline, here none.
    expect(noDescription).toContain("<description/><link>")

    const paths = episodesRoute.getStaticPaths().filter((p) => p.props.note.lang === lang)
    expect(paths.map((p) => p.params.path)).toEqual(["Podcast/Podcast"])
    const r = await episodesRoute.GET({ props: paths[0].props })
    expect(await r.text()).toContain("<itunes:episode>2</itunes:episode>")
  })
})

describe("layouts of a note's own text, from its properties", () => {
  test('properties name people and notes: a list, or one value split at commas and "and"', () => {
    const n = note("Texts/Decision")
    expect(refsOf(n, "Ann, [[Plain]] and Bob; Cy")).toEqual([{ text: "Ann" }, { text: "Plain", href: note("Plain").url }, { text: "Bob" }, { text: "Cy" }])
    expect(refsOf(n, ["[[No such note]]", ""])).toEqual([{ text: "No such note", href: undefined }])
    expect(refsOf(n, undefined)).toEqual([])
    expect(refsOf(n, 7)).toEqual([{ text: "7" }])
    expect(refsOf(n, { a: 1 })).toEqual([])
  })

  test("a paper: its authors, affiliations and venue, its links, and the entry to cite it by", () => {
    const paper = paperOf(note("Texts/Paper"))
    expect(paper.authors).toEqual([{ text: "Pat Plain", href: note("Plain").url }, { text: "Ann Author" }])
    expect(paper.affiliations).toEqual(["Garden Lab", "Slip Box Institute"])
    expect(paper.venue).toBe("NoteConf, 1–10")
    expect(paper.links.map((l) => l.href)).toEqual(["https://arxiv.org/abs/2301.00001", "https://slides.example/paper"])
    expect(paper.entry).toEqual({
      key: "plain2023paper",
      type: "inproceedings",
      fields: {
        author: "Pat Plain and Ann Author",
        title: "Paper",
        booktitle: "NoteConf",
        year: "2023",
        pages: "1--10",
        eprint: "2301.00001",
        archiveprefix: "arXiv",
      },
    })
    const preprint = paperOf(note("Texts/Preprint"))
    expect(preprint.entry).toMatchObject({ key: "2022preprint", type: "misc", fields: { year: "2022", doi: "10.1/x" } })
    expect(preprint.links).toEqual([{ label: "DOI", href: "https://doi.org/10.1/x" }])
    expect(preprint.venue).toBe("")
    expect(paperOf(withFm("Texts/Preprint", { journal: "J", volume: 2 })).venue).toBe("J 2")
    // A note without a date of its own falls back to when it was made.
    expect(paperOf({ ...note("Texts/Preprint"), created: undefined, source: { ...note("Texts/Preprint").source, fm: {} } }).entry.key).toBe("preprint")
  })

  test("a paper's page: the cite box first, the abstract, then the body", () => {
    const html = layoutHtml(note("Texts/Paper"), `<p>Lead.</p><h2 id="abstract">Abstract</h2><p>Found.</p><h2>Results</h2><p>Plenty.</p>`)
    expect(html).toStartWith('<details class="paper-cite"><summary>Cite this</summary><p class="paper-reference">')
    expect(html).toContain("@inproceedings{plain2023paper,")
    expect(html).toContain(
      '<section class="paper-abstract"><h2 id="abstract">Abstract</h2><p>Found.</p></section><div class="paper-body"><p>Lead.</p><h2>Results</h2>',
    )
    expect(layoutHtml({ ...note("Texts/Paper"), protected: true }, "<p>x</p>")).toBe("<p>x</p>")
  })

  test("a decision: its status in any usual spelling, who decided, what it replaced or what replaced it", () => {
    expect(decisionOf(note("Texts/Decision"))).toEqual({
      status: { key: "proposed", label: "Proposed" },
      deciders: [{ text: "Ann" }, { text: "Plain", href: note("Plain").url }],
      supersedes: [{ text: "Old decision", href: note("Texts/Old decision").url }],
      supersededBy: [],
    })
    expect(decisionOf(note("Texts/Old decision")).status).toEqual({ key: "superseded", label: "Superseded" })
    expect(decisionOf(note("Texts/Odd decision")).status).toEqual({ key: "on-hold", label: "On hold" })
    expect(decisionOf(note("Plain")).status).toBeUndefined()
    expect(layoutHtml(note("Texts/Decision"), "<h2>Context</h2><p>x</p>")).toContain('<section class="adr-section adr-context">')
  })

  test("what a layout's head shows stays out of the properties block", () => {
    expect(noteProperties(note("Texts/Paper")).map(([k]) => k)).toEqual(["slides"])
    expect(noteProperties(note("Texts/Decision"))).toEqual([])
    expect(noteProperties(note("Texts/Trip"))).toEqual([])
  })

  test("a changelog: its feed, at releases.xml under its page, lists the numbered versions", async () => {
    const n = note("Texts/Changes")
    expect(releasesUrl(n)).toBe(`${n.url}/releases.xml`)
    expect(releasesUrl({ ...n, url: "/" })).toBe("/releases.xml")
    const html = layoutHtml(n, "<h2>1.0.0</h2><p>x</p>")
    expect(html).toBe(
      `<p class="release-feed"><a href="${n.url}/releases.xml">RSS</a></p><section class="release" id="v1.0.0"><h2>1.0.0</h2><p>x</p></section>`,
    )
    expect(layoutHtml({ ...n, protected: true }, "<h2>1.0.0</h2>")).not.toContain("release-feed")
    const xml = await (await releasesFeed(n)).text()
    expect([...xml.matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1])).toEqual(["Changes · Layout coverage", "Changes v2.0.0", "Changes 1.0.0"])
    expect(xml).toContain(`<link>http://localhost:4321${n.url}#v2.0.0</link>`)
    expect(xml).toContain("<pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>")
    expect(xml).toContain("<description>Added Big thing.</description>")
  })

  test("a dialogue's speakers: a map to their pictures, published like a cover, or a list of names", () => {
    const talk = note("Texts/Talk")
    expect(talk.speakers).toEqual({ Ann: "/assets/_assets/cover.png" })
    expect(getVault().problems.some((p) => p.file === "Texts/Talk.md" && p.message.includes("speakers.Bob"))).toBe(true)
    expect(note("Texts/Chat").speakers).toBeUndefined()
    const lines = "<p>Ann: Hi.</p><p>Bob: Hello.</p>"
    expect(layoutHtml(talk, lines)).toContain('<img class="dialogue-avatar" src="/assets/_assets/cover.png"')
    expect(layoutHtml(note("Texts/Chat"), lines).match(/dialogue-line/g)).toHaveLength(2)
    expect(layoutHtml(note("Texts/Glossary"), "")).toBe(layoutHtml(note("Texts/Glossary"), ""))
    expect(layoutHtml({ ...note("Texts/Chat"), source: { ...note("Texts/Chat").source, fm: {} } }, lines)).toBe(lines)
  })

  test("highlights show their book: its author, and where they come from as a link or a name", () => {
    expect(itemOf(note("Texts/Highlights"))).toEqual({
      kind: undefined,
      upright: true,
      byline: ["Ann Author"],
      rating: undefined,
      status: undefined,
      links: [{ label: "readwise.io", href: "https://readwise.io/books/1" }],
    })
    expect(itemOf(note("Texts/Kindle"))).toMatchObject({ byline: ["Kindle"], links: [] })
    expect(layoutHtml(note("Texts/Kindle"), "<blockquote><p>Q</p></blockquote>")).toContain("highlight-card")
  })

  test("a glossary lists the terms of the garden it does not define itself", () => {
    const n = note("Texts/Glossary")
    const html = layoutHtml(n, "<p><strong>Slip box</strong>: defined here.</p>")
    expect(html).toContain('<dt><a class="internal" href="' + note("Texts/Card").url + '" data-key="Texts/Card">Card</a>')
    expect(html).toContain("<dd></dd>")
    // Slip is defined on the page under one of its names.
    expect(html).not.toContain('data-key="Texts/Slip"')
    expect(layoutHtml(n, "")).toContain(
      'data-key="Texts/Slip">Slip</a><a class="heading-anchor" aria-hidden="true" tabindex="-1" href="#slip">#</a></dt><dd><p>A box of slips.</p></dd>',
    )
    // The page of a term never lists itself.
    expect(layoutHtml({ ...note("Texts/Slip"), layout: "glossary" }, "")).not.toContain('data-key="Texts/Slip"')
  })

  test("a trip's route: notes with a location, pairs and named places, in order", () => {
    const n = note("Texts/Trip")
    expect(routeOf(n)).toEqual([
      { lat: 35.01, lng: 135.77, title: "Kyoto", url: note("Travel/Kyoto").url, description: undefined },
      { lat: 10, lng: 20, title: "3", url: "" },
      { lat: 16.4, lng: 107.5, title: "Huế", url: "" },
      { lat: 1, lng: 2, title: "5", url: "" },
    ])
    expect(routeOf(note("Plain"))).toEqual([])
    const html = layoutHtml(n, "<p>Intro</p><h2>Day 1</h2><p>x</p>")
    expect(html).toStartWith('<p>Intro</p><div class="map-canvas trip-map" role="region" aria-label="Map" data-map="[{&quot;lat&quot;:35.01')
    expect(html).toContain(" data-route ")
  })

  test("a trip without a route maps its stops: a pin of their own, or the first note they link to with a location", () => {
    const n = { ...note("Texts/Trip"), source: { ...note("Texts/Trip").source, fm: {} } }
    const html = layoutHtml(
      n,
      `<h2 id="d1">Day 1</h2><p>📍 1.5, 2.5</p><p><img src="/a.png" alt=""></p>` +
        `<h2>Day 2 <a href="/Travel/Kyoto" class="internal" data-key="Travel/Kyoto">Kyoto</a></h2>` +
        `<h2 id="d3">Day 3</h2><p>location: 95, 10</p>` +
        `<h2 id="d4">Day 4</h2><p><a class="internal" data-key="Plain">Plain</a></p>`,
    )
    const places = JSON.parse(html.match(/data-map="([^"]*)"/)![1].replace(/&quot;/g, '"'))
    expect(places).toEqual([
      { lat: 1.5, lng: 2.5, title: "Day 1", url: "#d1" },
      { lat: 35.01, lng: 135.77, title: "Day 2 Kyoto", url: "" },
    ])
    expect(html).toContain('<div class="trip-strip" role="group" aria-label="Day 1" tabindex="0"><figure class="gallery-item">')
    expect(html).not.toContain("📍")
    // A stop with nowhere to be leaves no map.
    expect(layoutHtml(n, "<h2>Home</h2><p>Rest.</p>")).not.toContain("map-canvas")
    expect(layoutHtml(n, "<p>No days.</p>")).toBe("<p>No days.</p>")
  })

  test("a syllabus lists the notes of the series it introduces, a locked one without its length", () => {
    const n = note("Texts/Course")
    const lessons = lessonsOf(n, [])
    expect(lessons.map((l) => [l.id, l.minutes, l.body])).toEqual([
      ["Texts/Lesson one", 1, "<p>Where to start.</p>"],
      ["Texts/Lesson two", undefined, ""],
    ])
    expect(lessons[0].heading).toBe(
      `<h2 id="lesson-1"><a class="internal" href="${note("Texts/Lesson one").url}" data-key="Texts/Lesson one">Lesson one</a></h2>`,
    )
    // A part of the series naming it lists the others.
    expect(lessonsOf(note("Texts/Lesson one"), []).map((l) => l.id)).toEqual(["Texts/Lesson two"])
    expect(lessonsOf(note("Plain"), [])).toEqual([])
    const html = layoutHtml(n, "<p>Intro</p>")
    expect(html).toContain('<li class="lesson" data-lesson="Texts/Lesson two">')
    expect(layoutHtml(n, "<h2>Only</h2><p>One lesson.</p>")).toContain('<li class="lesson" data-lesson="lesson-1">')
  })
})

describe("seven more layouts of a note's own text", () => {
  const problem = (file: string, text: string) => getVault().problems.some((p) => p.file === file && p.message.includes(text))

  test("a poem keeps its line breaks and indentation, and renders the translation it goes beside", async () => {
    const n = note("Texts/Verse")
    expect(n.hardBreaks).toBe(true)
    expect(n.md).toContain("\u00a0\u00a0the wind returns.")
    // The code block of the English text stays out of the Vietnamese one.
    expect(n.translation).toEqual({ lang: "vi-VN", md: "\nTrăng lên,\n\u00a0\u00a0gió về.\n" })
    const translation = await renderTranslation(n)
    expect(translation).toBe("<p>Trăng lên,<br>\n\u00a0\u00a0gió về.</p>")
    const html = layoutHtml(n, (await renderNote(n)).html, translation)
    expect(html).toStartWith(
      '<div class="poem is-numbered is-bilingual"><div class="poem-pair poem-langs"><p lang="en-US">English</p><p lang="vi-VN">Tiếng Việt</p></div>',
    )
    // Only the English text has the code block, so its row has nothing beside it.
    expect(html).toContain('<div class="poem-pair"><div class="poem-col" lang="en-US"><pre')
    expect(html).toContain('</pre></div><div class="poem-col" lang="vi-VN"></div></div>')
    // Unrendered, the poem is shown alone.
    expect(layoutHtml(n, "<p>x</p>")).toBe('<div class="poem is-numbered"><p class="stanza">x</p></div>')
    expect(layoutHtml({ ...n, protected: true }, "")).toBe("")
    // A poem whose page is in its `bilingual` language goes beside its original, which comes first.
    const native = note("Texts/Native verse")
    expect(native.translation).toEqual({ lang: "vi-VN", md: "\nGốc.\n" })
    expect(layoutHtml(native, "<p>Root.</p>", "<p>Gốc.</p>")).toContain(
      '<div class="poem-col" lang="vi-VN"><p class="stanza">Gốc.</p></div><div class="poem-col" lang="en-US">',
    )
    expect(note("Texts/Same verse").translation).toBeUndefined()
    expect(await renderTranslation(note("Texts/Same verse"))).toBeUndefined()
    expect(note("Texts/Lonely verse").translation).toBeUndefined()
    expect(problem("Texts/Lonely verse.md", 'bilingual "fr-FR" has no <!--lang:fr-FR--> block')).toBe(true)
    // A protected poem's translation is part of what its password guards.
    expect(note("Texts/Locked verse").translation).toBeUndefined()
    expect(await renderTranslation({ ...n, protected: true })).toBeUndefined()
    expect(noteProperties(n)).toEqual([])
  })

  test("a letter: its place and date written out, signed by a picture or in words", () => {
    const letter = note("Texts/Letter")
    expect(letter.signature).toBe("/assets/_assets/cover.png")
    expect(layoutHtml(letter, "<p>Dear Ann,</p><p>Body.</p>")).toBe(
      '<div class="letter"><p class="letter-dateline">Huế, <time datetime="2026-03-04">March 4, 2026</time></p><p class="letter-salutation">Dear Ann,</p><p>Body.</p>' +
        '<div class="letter-sign"><img class="letter-signature-image" src="/assets/_assets/cover.png" alt="Signature" loading="lazy"></div></div>',
    )
    const words = note("Texts/Word letter")
    expect(words.signature).toBeUndefined()
    expect(layoutHtml(words, "<p>Hi.</p>")).toBe(
      '<div class="letter"><p class="letter-dateline">someday</p><p>Hi.</p><div class="letter-sign"><p class="letter-signature">Ada</p></div></div>',
    )
    expect(layoutHtml(withFm("Texts/Word letter", {}), "<p>Hi.</p>")).toBe('<div class="letter"><p>Hi.</p></div>')
    // A protected letter publishes no signature, and its page shows nothing of it.
    expect(note("Texts/Locked letter").signature).toBeUndefined()
    expect(layoutHtml(note("Texts/Locked letter"), "")).toBe("")
    expect(noteProperties(letter)).toEqual([])
  })

  test("a comparison reads + and - items as pros and cons, and its pick by name", () => {
    const n = note("Texts/Compare")
    expect(n.md).toContain("* ✅ Fast\n* ❌ Slow\n+ ✅ Already marked")
    expect(n.md).toContain("```text\n+ in code\n```")
    const html = layoutHtml(n, "<h2>A</h2><ul><li>✅ Fast</li></ul><h2>B</h2><p>x</p>")
    expect(html).toContain('<section class="compare-option is-picked"><h2>B</h2><p class="compare-badge">Our pick</p>')
    expect(html).toContain('<p class="compare-label">Pros</p>')
    expect(noteProperties(n)).toEqual([])
  })

  test("a checklist makes the note's tasks tickable", () => {
    const n = withFm("Plain", {}, { layout: "checklist" })
    expect(layoutHtml(n, '<ul><li class="task-list-item"><input type="checkbox" disabled aria-label="A"> A</li></ul>')).toContain(
      '<input type="checkbox" aria-label="A" data-check="a">',
    )
  })

  test("a recipe card: the cover and facts of its note, and nothing of a protected one", () => {
    const card = layoutHtml(note("Texts/Card recipe"), "<h2>Ingredients</h2><ul><li>Tea</li></ul>")
    expect(card).toStartWith(
      '<div class="recipe-card"><img class="recipe-card-cover" src="/assets/_assets/cover.png" alt="" loading="lazy"><p class="recipe-card-facts">⏱ 5 min</p><div class="recipe">',
    )
    expect(card).toEndWith('<p class="recipe-card-tools"><button type="button" class="recipe-card-print" data-print>Print card</button></p>')
    expect(layoutHtml(note("Texts/Bare card"), "<p>Nothing.</p>")).toStartWith('<div class="recipe-card"><p>Nothing.</p></div>')
    expect(layoutHtml({ ...note("Texts/Card recipe"), protected: true }, "")).toBe("")
    expect(noteProperties(note("Texts/Card recipe"))).toEqual([])
  })

  test("a hub draws its note's sections round its title", () => {
    const html = layoutHtml(withFm("Plain", {}, { layout: "hub" }), '<h2 id="a">A</h2><ul><li><a href="/x">X</a></li></ul>')
    expect(html).toContain('<text class="hub-centre-label" y="6" text-anchor="middle">Plain</text>')
  })

  test("lore: relations as a map, a list or unquoted links; the family they make; who names an entity, and how", () => {
    const a = note("Texts/Lore A")
    expect(relationsOf(a)).toEqual([
      { name: "parent", refs: [{ text: "Lore B", href: note("Texts/Lore B").url, key: "Texts/Lore B" }] },
      {
        name: "allies",
        refs: [
          { text: "Lore C", href: note("Texts/Lore C").url, key: "Texts/Lore C" },
          { text: "Dee", key: undefined },
          { text: "Plain", href: note("Plain").url, key: "Plain" },
        ],
      },
      { name: "rank", refs: [{ text: "3", key: undefined }] },
    ])
    expect(relationsOf(note("Texts/Lore B")).map((r) => [r.name, r.refs.map((x) => x.key)])).toEqual([
      ["child", ["Texts/Lore A"]],
      ["mentor", ["Texts/Lore A"]],
    ])
    expect(relationsOf(note("Texts/Lore D"))).toEqual([])
    expect(relationsOf(note("Plain"))).toEqual([])
    expect(relationsOf(withFm("Texts/Lore A", { relations: { ghost: "[[No such entity]]", none: [] } }))).toEqual([
      { name: "ghost", refs: [{ text: "No such entity", href: undefined, key: undefined }] },
    ])
    // The protected entity naming A as its enemy says nothing; B names it twice, C only links to it.
    const links = loreLinksOf(a)
    expect(links.relations.map((g) => [g.name, g.notes.map((x) => x.key)])).toEqual([
      ["child", ["Texts/Lore B"]],
      ["mentor", ["Texts/Lore B"]],
    ])
    expect(links.mentions.map((x) => x.key)).toEqual(["Texts/Lore C"])
    const html = layoutHtml(a, "<p>Hero.</p>")
    expect(html).toStartWith(
      '<p>Hero.</p><section class="lore-relations"><h2>Relations</h2><dl><div><dt>parent</dt><dd><a class="internal" href="' +
        note("Texts/Lore B").url +
        '">Lore B</a></dd></div>',
    )
    expect(html).toContain("<div><dt>rank</dt><dd>3</dd></div>")
    expect(html).toContain('<section class="lore-links"><h2>In the lore</h2><dl><div><dt>child of</dt>')
    expect(html).toContain('<div><dt>Mentioned in</dt><dd><a class="internal" href="' + note("Texts/Lore C").url + '">Lore C</a></dd></div>')
    expect(html).not.toContain("enemy")
    expect(layoutHtml(note("Texts/Lore D"), "")).toBe("")
    expect(layoutHtml({ ...a, protected: true }, "")).toBe("")
    expect(noteProperties(a).map(([k]) => k)).toEqual(["kind"])
    const tree = loreTree("Me", [
      { name: "Mother", refs: [{ text: "Ma", href: "/ma" }] },
      { name: "wife", refs: [{ text: "Wi" }] },
      { name: "Con", refs: [{ text: "Kid" }] },
      { name: "ally", refs: [{ text: "Al" }] },
    ])
    expect(tree).toBe(
      '<figure class="lore-tree" aria-hidden="true"><ul class="lore-tree-row is-up"><li><a class="internal" href="/ma" tabindex="-1">Ma</a><small>Mother</small></li></ul>' +
        '<ul class="lore-tree-row is-self"><li class="lore-self">Me</li><li>Wi<small>wife</small></li></ul><ul class="lore-tree-row is-down"><li>Kid<small>Con</small></li></ul></figure>',
    )
    expect(loreTree("Me", [{ name: "ally", refs: [{ text: "Al" }] }])).toBe("")
  })
})
