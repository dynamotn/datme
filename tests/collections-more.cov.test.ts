import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import path from "node:path"
import { site, loadConfig, type SiteConfig } from "../src/site.config"
import { getVault, type Note } from "../src/lib/vault"
import { renderNote } from "../src/lib/markdown"
import { digestOf, isoWeek, passageUrl, priceTotals, quotebookOf } from "../src/lib/collection-views"
import { digestFeed, digestPath } from "../src/lib/feed"
import * as digestRoute from "../src/pages/[...path]/digest.xml"
import { groupChoices } from "../src/lib/dev-look"
import { noteProperties } from "../src/lib/properties"
import {
  collectionKindOf,
  collectionOf,
  formatPrice,
  itemOf,
  priceOf,
  priorityOf,
  progressOf,
  questionOf,
  quoteOf,
  quotesHtml,
  quotesOf,
  replaceDivs,
  sourcesOf,
  specOf,
  type Collection,
} from "../src/lib/note-layouts"

/**
 * Courses, a wishlist, a quotebook, questions and a digest, read from the
 * collections coverage vault, pointed at for the length of this file.
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
const withFm = (key: string, fm: Record<string, unknown>): Note => {
  const n = note(key)
  return { ...n, source: { ...n.source, fm: { ...n.source.fm, ...fm } } }
}
const groupsOf = (n: Note) => collectionOf(n, specOf(n, n.layout as Collection)).map((gr) => [gr.key, gr.label, gr.notes.map((x) => x.key)])

describe("courses", () => {
  test("by status in their usual spellings, each with its progress and certificate", () => {
    expect(groupsOf(note("Courses/Courses"))).toEqual([
      ["in-progress", "In progress", ["Courses/Go"]],
      ["completed", "Completed", ["Courses/Math"]],
    ])
    expect(progressOf(note("Courses/Go"))).toEqual({ percent: 45, label: "45%" })
    expect(progressOf(note("Courses/Math"))).toEqual({ percent: 100, label: "7/7" })
    expect(progressOf(withFm("Courses/Go", { progress: 150 }))).toEqual({ percent: 100, label: "100%" })
    expect(progressOf(withFm("Courses/Go", { progress: "12.25" }))).toEqual({ percent: 12.25, label: "12.3%" })
    expect(progressOf(withFm("Courses/Go", { progress: "3/0" }))).toBeUndefined()
    expect(progressOf(withFm("Courses/Go", { progress: "half" }))).toBeUndefined()
    expect(note("Courses/Go").certificate).toEqual({ href: "https://cert.example/go" })
    expect(note("Courses/Math").certificate).toEqual({ href: "/assets/_assets/cover.png", file: "_assets/cover.png" })
    expect(itemOf(note("Courses/Go"))).toMatchObject({
      kind: "courses",
      byline: ["Udemy", "Gopher", "2024 – now"],
      status: "In progress",
      progress: { percent: 45, label: "45%" },
      links: [{ label: "Certificate", href: "https://cert.example/go" }],
    })
  })

  test("a protected course's certificate stays out of the site", () => {
    expect(note("Courses/Secret").certificate).toBeUndefined()
    expect(getVault().assets.has("_assets/secret-cert.pdf")).toBe(false)
    expect(getVault().assets.has("_assets/cover.png")).toBe(true)
  })
})

describe("a wishlist", () => {
  test("by status, wishes by priority, with prices in the note's language and totals per currency", () => {
    expect(groupsOf(note("Wishes/Wishes"))).toEqual([
      ["wanted", "Wanted", ["Wishes/Bag", "Wishes/Pen"]],
      ["bought", "Bought", expect.arrayContaining(["Wishes/Hat", "Wishes/Free"])],
    ])
    expect(priceOf(note("Wishes/Pen"))).toEqual({ amount: 12, currency: "USD" })
    expect(priceOf(note("Wishes/Bag"))).toEqual({ amount: 1299.5, currency: "EUR" })
    expect(priceOf(withFm("Wishes/Pen", { price: "1,299.00 ₫" }))).toEqual({ amount: 1299, currency: "VND" })
    expect(priceOf(withFm("Wishes/Pen", { price: "about 20" }))).toEqual({ amount: 20, currency: undefined })
    expect(priceOf(note("Wishes/Free"))).toBeUndefined()
    expect(formatPrice(1299.5, "EUR", "vi-VN")).toMatch(/^1\.299,50\s€$/)
    expect(formatPrice(20, undefined, lang)).toBe("20")
    // A currency Intl does not know is written after the amount.
    expect(formatPrice(5, "US$", lang)).toBe("5 US$")
    expect(priceTotals(["Wishes/Pen", "Wishes/Bag", "Wishes/Hat", "Wishes/Free"].map(note), lang)).toEqual(["$12.00", "€1,299.50", "5 US$"])
    expect(priceTotals([withFm("Wishes/Pen", { price: 2, currency: "" }), withFm("Wishes/Pen", { price: 3, currency: "" })], lang)).toEqual(["5"])
    expect(priorityOf(note("Wishes/Bag"))).toEqual({ rank: 0, label: "high" })
    expect(priorityOf(note("Wishes/Pen"))).toEqual({ rank: 1, label: "2" })
    expect(priorityOf(withFm("Wishes/Pen", { priority: "Someday" }))).toEqual({ rank: 2, label: "Someday" })
    expect(priorityOf(note("Wishes/Free"))).toEqual({ rank: Infinity, label: "" })
    expect(itemOf(note("Wishes/Bag"))).toMatchObject({ kind: "wishlist", byline: ["€1,299.50", "Satchel Co", "high"], status: "Wanted" })
  })
})

describe("a quotebook", () => {
  test("quotes are read as the quotes layout reads them", () => {
    expect(quoteOf("<p>Be kind.</p>\n<p>— Ann</p>\n")).toEqual({ text: "<p>Be kind.</p>", who: "Ann" })
    expect(quoteOf("<p>Go.\n— Bob</p>")).toEqual({ text: "<p>Go.</p>", who: "Bob" })
    expect(quoteOf("<p>Anon.</p>")).toEqual({ text: "<p>Anon.</p>", who: undefined })
    expect(quotesHtml("<blockquote><p>A.</p><p>— B</p></blockquote>")).toBe('<div class="quote-wall"><figure class="quote-card"><blockquote><p>A.</p></blockquote><figcaption>B</figcaption></figure></div>')
  })

  test("the quotes of a note: signed ones only, with their block ids, not those it embeds", () => {
    const html =
      `<blockquote id="^a&amp;b"><p>One.</p><p>— Ann</p></blockquote><blockquote><p>Unsigned.</p></blockquote>` +
      `<div class="transclude" data-url="/x"><blockquote><p>Embedded.</p><p>— Eve</p></blockquote></div><p>after</p>`
    expect(quotesOf(html)).toEqual([{ text: "<p>One.</p>", who: "Ann", id: "^a&b" }])
    expect(replaceDivs("<div class=\"x\"><div></div></div><p>y</p>", /<div class="x">/g, (i) => `[${i}]`)).toBe("[0]<p>y</p>")
  })

  test("every quote of the notes, grouped by who said it, by note, or not at all", async () => {
    const book = note("Sayings/Sayings")
    const spec = specOf(book, "quotebook")
    expect(spec.group).toBe("author")
    const notes = collectionOf(book, { ...spec, group: "none" }).flatMap((gr) => gr.notes)
    // The protected note is not listed; the locked part is only ciphertext.
    expect(notes.map((n) => n.key)).toEqual(["Sayings/Ann", "Sayings/Bob", "Sayings/Parts"])
    const byAuthor = await quotebookOf(book, spec, notes)
    expect(byAuthor.map((gr) => [gr.key, gr.label, gr.quotes.map((q) => q.text)])).toEqual([
      ["ann", "Ann", ["<p>Plant early.</p>"]],
      // "Bob" and "bob" are one person; the first spelling names them.
      ["bob", "bob", ["<p>Water late.</p>", "<p>Weed often.</p>"]],
    ])
    expect(byAuthor[0].quotes[0].href).toBe(`${note("Sayings/Ann").url}#^early`)
    expect(byAuthor[1].quotes[0].href).toBe(`${note("Sayings/Ann").url}#:~:text=Water%20late.`)
    const bySource = await quotebookOf(book, { ...spec, group: "source" }, notes)
    expect(bySource.map((gr) => [gr.key, gr.note?.key, gr.quotes.length])).toEqual([
      ["Sayings/Ann", "Sayings/Ann", 2],
      ["Sayings/Bob", "Sayings/Bob", 1],
    ])
    const none = await quotebookOf(book, { ...spec, group: "none" }, notes)
    expect(none.map((gr) => [gr.key, gr.quotes.map((q) => q.who)])).toEqual([["", ["Ann", "bob", "Bob"]]])
    expect(await quotebookOf(book, { ...spec, group: "none" }, [])).toEqual([])
    const all = JSON.stringify([byAuthor, bySource, none].map((x) => x.map((gr) => gr.quotes.map((q) => q.text))))
    expect(all).not.toContain("Secret")
    expect(all).not.toContain("Sealed")
    expect((await renderNote(note("Sayings/Parts"))).html).not.toContain("Sealed")
  })

  test("a passage is linked by its block id, else by its first words", () => {
    const ann = note("Sayings/Ann")
    expect(passageUrl(ann, "<p>x</p>", "^id")).toBe(`${ann.url}#^id`)
    expect(passageUrl(ann, "<p>A long-ish quote, with commas &amp; more words than we keep here</p>")).toBe(
      `${ann.url}#:~:text=A%20long%2Dish%20quote%2C%20with%20commas%20%26%20more%20words`,
    )
    expect(passageUrl(ann, "<p> </p>")).toBe(ann.url)
  })

  test("the notes of a quotebook or a digest keep their own page", () => {
    expect(collectionKindOf(note("Sayings/Ann"))).toBeUndefined()
    expect(itemOf(note("Sayings/Ann"))).toBeUndefined()
    // A question in a digest is still an item of its questions.
    expect(collectionKindOf(note("Asked/Open one"))).toBe("questions")
  })
})

describe("questions", () => {
  test("the notes tagged #question by default; a digest is of the whole garden", () => {
    expect(sourcesOf(note("Asked/Asked"))).toEqual({ folders: [], tags: ["question"] })
    expect(sourcesOf(withFm("Digest", { from: undefined }))).toEqual({ folders: [""], tags: [] })
    expect(sourcesOf(note("Digest"))).toEqual({ folders: ["Asked"], tags: [] })
  })

  test("open first, oldest first; answered by status, `answer` or a link under Answers", () => {
    expect(groupsOf(note("Asked/Asked"))).toEqual([
      ["open", "Open", ["Asked/Open two", "Asked/Open one", "Asked/Section empty"]],
      ["answered", "Answered", ["Asked/By link", "Asked/By hidden", "Asked/By url", "Asked/By words", "Asked/By section", "Asked/By status"]],
    ])
    expect(questionOf(note("Asked/By link"))).toEqual({ answered: true, answer: { text: "the plain note", href: note("Plain").url } })
    expect(questionOf(withFm("Asked/By link", { answer: ["[[Plain]]"] }))).toEqual({ answered: true, answer: { text: "Plain", href: note("Plain").url } })
    // An unlisted note answers without being named.
    expect(questionOf(note("Asked/By hidden"))).toEqual({ answered: true, answer: undefined })
    expect(questionOf(withFm("Asked/By hidden", { answer: "[[Not a note]]" }))).toEqual({ answered: true, answer: undefined })
    expect(questionOf(note("Asked/By url"))).toEqual({ answered: true, answer: { text: "example.com", href: "https://www.example.com/a" } })
    expect(questionOf(note("Asked/By words"))).toEqual({ answered: true, answer: { text: "Forty-two" } })
    expect(questionOf(withFm("Asked/By words", { answer: 42 }))).toEqual({ answered: true, answer: { text: "42" } })
    expect(questionOf(note("Asked/By section"))).toEqual({ answered: true, answer: { text: "Plain", href: note("Plain").url } })
    expect(questionOf(note("Asked/By status"))).toEqual({ answered: true, answer: undefined })
    expect(questionOf(note("Asked/Section empty"))).toEqual({ answered: false, answer: undefined })
    expect(questionOf(note("Asked/Open one"))).toEqual({ answered: false, answer: undefined })
    // The note may name them, or name other statuses: open ones still come first.
    const named = withFm("Asked/Asked", { statuses: { answered: "Settled", open: "Wondering" } })
    expect(collectionOf(named, specOf(named, "questions")).map((gr) => [gr.key, gr.label])).toEqual([
      ["open", "Wondering"],
      ["answered", "Settled"],
    ])
    const other = withFm("Asked/Asked", { statuses: { todo: "To do" } })
    expect(collectionOf(other, specOf(other, "questions")).map((gr) => [gr.key, gr.label])).toEqual([
      ["open", "Open"],
      ["answered", "Answered"],
    ])
  })

  test("a question's page says whether it is answered, and by what", () => {
    expect(itemOf(note("Asked/By link"))).toMatchObject({
      kind: "questions",
      byline: [],
      status: "Answered",
      answer: { text: "the plain note", href: note("Plain").url },
    })
    expect(itemOf(note("Asked/Open one"))).toMatchObject({ status: "Open", answer: undefined })
  })
})

describe("a digest", () => {
  test("ISO weeks: the year of their Thursday, Monday to Sunday", () => {
    expect(isoWeek(new Date("2024-01-01T12:00:00Z"))).toEqual({ id: "2024-W01", year: 2024, week: 1, start: "2024-01-01", end: "2024-01-07" })
    expect(isoWeek(new Date("2021-01-03T00:00:00Z"))).toEqual({ id: "2020-W53", year: 2020, week: 53, start: "2020-12-28", end: "2021-01-03" })
    expect(isoWeek(new Date("2024-12-30T00:00:00Z")).id).toBe("2025-W01")
  })

  test("the notes planted and tended each week, newest week first, `limit` weeks", () => {
    const digest = note("Digest")
    const notes = collectionOf(digest, { ...specOf(digest, "digest"), group: "none" }).flatMap((gr) => gr.notes)
    const weeks = digestOf(digest, notes)
    expect(weeks.map((w) => [w.id, w.label, w.start, w.end])).toEqual([
      ["2024-W03", "Week 3, 2024", "2024-01-15", "2024-01-21"],
      ["2024-W02", "Week 2, 2024", "2024-01-08", "2024-01-14"],
    ])
    expect(weeks[0].tended.map((e) => e.note.key)).toEqual(["Asked/Open two"])
    expect(weeks[0].planted).toEqual([])
    expect(weeks[1].planted.map((e) => e.note.key)).toEqual(["Asked/Section empty", "Asked/Open one"])
    expect(weeks[1].planted[0].url).toBe(note("Asked/Section empty").url)
    expect(digestOf(withFm("Digest", { limit: 0 }), notes)).toHaveLength(3)
  })

  test("a note planted and tended in one week counts as planted; it is tended once, at its latest change", () => {
    const base = note("Asked/Open one")
    const at = (d: string) => new Date(`${d}T00:00:00Z`)
    const weeks = digestOf(note("Digest"), [
      { ...base, created: at("2024-03-04"), updated: at("2024-03-06") },
      { ...base, key: "b", created: at("2024-01-01"), updated: at("2024-03-07") },
      { ...base, key: "b", created: undefined, updated: at("2024-03-05") },
      { ...base, key: "c", created: undefined, updated: undefined },
      { ...base, key: "d", draft: true },
    ])
    expect(weeks.map((w) => [w.id, w.planted.map((e) => e.note.key), w.tended.map((e) => [e.note.key, e.date.toISOString().slice(0, 10)])])).toEqual([
      ["2024-W10", ["Asked/Open one"], [["b", "2024-03-07"]]],
      ["2024-W01", ["b"], []],
    ])
  })

  test("a feed of the weeks next to the digest", async () => {
    const digest = note("Digest")
    expect(digestPath(digest)).toBe("Digest/digest.xml")
    expect(digestPath({ ...digest, slug: "index" })).toBe("digest.xml")
    const xml = await (await digestFeed(digest)).text()
    expect(xml).toContain("<title>Week 3, 2024 (Jan 15, 2024 – Jan 21, 2024)</title>")
    expect(xml).toContain(`<link>http://localhost:4321${digest.url}#2024-w03</link>`)
    expect(xml).toContain("<description>Tended: Open two</description>")
    expect(xml).toContain("<description>Planted: Section empty, Open one</description>")
    expect(xml).toContain("<pubDate>Mon, 15 Jan 2024 00:00:00 GMT</pubDate>")
    const paths = digestRoute.getStaticPaths().filter((p) => p.props.note.lang === lang)
    expect(paths.map((p) => p.params.path)).toEqual(["Digest"])
    expect(await (await digestRoute.GET({ props: paths[0].props })).text()).toContain("<item>")
  })

  test("its `limit` stays out of the properties, and datme dev offers only its own groupings", () => {
    expect(noteProperties(note("Digest"))).toEqual([])
    expect(groupChoices("digest", undefined)).toEqual(["week"])
    expect(groupChoices("quotebook", undefined)).toEqual(["author", "source", "none"])
    expect(groupChoices("courses", undefined)).toEqual(["status", "year", "month", "none"])
  })
})
