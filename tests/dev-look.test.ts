import { describe, expect, test } from "bun:test"
import {
  configLines,
  describeFrameRule,
  describeGroup,
  describeLayout,
  describeLookRule,
  folderStandIn,
  groupChoices,
  groupOf,
  keepRequestUrl,
  ownGroup,
  pageUrl,
  previewNote,
  previewOf,
  previewUrl,
  resetUrl,
  shownLayout,
  type LookTarget,
} from "../src/lib/dev-look"
import type { FolderNode } from "../src/lib/vault"

const page = (q = "") => new URL(`http://localhost:4321/notes/a/${q}`)
const note: LookTarget = { kind: "note", file: "Writing/Essay.md", dir: "Writing" }

describe("previewOf", () => {
  test("reads a known style and chrome under datme dev", () => {
    expect(previewOf(page("?style=Garden&chrome=minimal"), true)).toMatchObject({ style: "garden", chrome: "minimal" })
  })
  test("reads a layout, none included, and a grouping", () => {
    expect(previewOf(page("?layout=Books&group=season|year"), true)).toMatchObject({ layout: "books", group: "season|year" })
    expect(previewOf(page("?layout=none"), true).layout).toBe("none")
  })
  test("drops unknown values", () => {
    const none = { style: undefined, chrome: undefined, layout: undefined, group: undefined }
    expect(previewOf(page("?style=fancy&chrome=full-norail&layout=poster&group=%3Cb%3E"), true)).toEqual(none)
    expect(previewOf(page("?group=%20"), true)).toEqual(none)
    expect(previewOf(page(), true)).toEqual(none)
  })
  test("is empty outside datme dev, whatever the address", () => {
    expect(previewOf(page("?style=garden"), false)).toEqual({})
  })
  test("follows DATME_DEV by default", () => {
    const before = process.env.DATME_DEV
    delete process.env.DATME_DEV
    expect(previewOf(page("?style=garden"))).toEqual({})
    process.env.DATME_DEV = "1"
    expect(previewOf(page("?style=garden")).style).toBe("garden")
    if (before === undefined) delete process.env.DATME_DEV
    else process.env.DATME_DEV = before
  })
})

describe("keepRequestUrl and pageUrl", () => {
  test("the query of the request reaches the page while it renders, and only then", async () => {
    const astroUrl = new URL("http://localhost:4321/notes/a/")
    expect(pageUrl(astroUrl)).toBe(astroUrl)
    let seen: URL | undefined
    let preview: unknown
    keepRequestUrl({ url: "/notes/a/?style=garden" }, {}, () => {
      // Async, as Astro renders: the request's address follows the work it started.
      void Promise.resolve().then(() => {
        seen = pageUrl(astroUrl)
        preview = previewOf(astroUrl, true)
      })
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(seen?.href).toBe("http://localhost:4321/notes/a/?style=garden")
    expect(preview).toMatchObject({ style: "garden", chrome: undefined })
    expect(pageUrl(astroUrl).search).toBe("")
  })
  test("a request without an address keeps the root", () => {
    let seen: URL | undefined
    keepRequestUrl({}, {}, () => void (seen = pageUrl(new URL("http://localhost:4321/x/"))))
    expect(seen?.href).toBe("http://localhost:4321/x/")
  })
})

describe("previewUrl", () => {
  test("sets one key and keeps the rest of the address", () => {
    expect(previewUrl(page("?chrome=minimal#top"), "style", "darkroom")).toBe("/notes/a/?chrome=minimal&style=darkroom#top")
  })
  test("drops the key to go back to the page's own", () => {
    expect(previewUrl(page("?style=garden&chrome=minimal"), "style", undefined)).toBe("/notes/a/?chrome=minimal")
  })
})

describe("resetUrl", () => {
  test("drops every preview and keeps the rest", () => {
    expect(resetUrl(page("?style=garden&chrome=minimal&layout=books&group=year&q=1#top"))).toBe("/notes/a/?q=1#top")
  })
})

const folder: FolderNode = { segment: "Books", name: "Books", dir: "Reading/Books", url: "/reading/books/", folders: [], notes: [] }

describe("folderStandIn", () => {
  test("stands for the folder note a folder lacks", () => {
    const n = folderStandIn(folder, "en")
    expect(n).toMatchObject({ key: "Reading/Books/Books", dir: "Reading/Books", slug: "reading/books", title: "Books", protected: false })
    expect(n.source).toMatchObject({ file: "Reading/Books/Books.md", stem: "Books", fm: {} })
    expect(folderStandIn({ ...folder, dir: "", segment: "" }, "en").key).toBe("")
  })
})

describe("layout previews", () => {
  const books = { ...folderStandIn(folder, "en"), layout: "books" as const }
  test("shownLayout: the one asked for, none, or the page's own", () => {
    expect(shownLayout("cv", {})).toBe("cv")
    expect(shownLayout("cv", { layout: "none" })).toBeUndefined()
    expect(shownLayout(undefined, { layout: "gallery" })).toBe("gallery")
  })
  test("previewNote: another layout and grouping, the same note when nothing changes", () => {
    expect(previewNote(books, {})).toBe(books)
    expect(previewNote(books, { layout: "books" })).toBe(books)
    expect(previewNote(books, { layout: "none" }).layout).toBeUndefined()
    const grouped = previewNote(books, { group: "year" })
    expect(grouped.source.fm.group).toBe("year")
    expect(books.source.fm.group).toBeUndefined()
    // A grouping means nothing to a page that is not a collection.
    expect(previewNote(books, { layout: "cv", group: "year" }).source).toBe(books.source)
  })
  test("ownGroup reads the note's group, groupOf falls back to its layout's", () => {
    expect(ownGroup(books)).toBeUndefined()
    expect(ownGroup(previewNote(books, { group: "author" }))).toBe("author")
    expect(groupOf("books", undefined)).toBe("status")
    expect(groupOf("talks", "event")).toBe("event")
    expect(groupOf("cv", "year")).toBeUndefined()
  })
  test("groupChoices: the default first, the usual ones, then the note's own", () => {
    expect(groupChoices("talks", "event")).toEqual(["year", "status", "month", "none", "event"])
    expect(groupChoices("books", undefined)).toEqual(["status", "year", "month", "none"])
    expect(groupChoices("cv", undefined)).toEqual([])
  })
  test("describeLayout and describeGroup say where they come from", () => {
    expect(describeLayout({ layout: "books" }, note)).toBe("layout: in Writing/Essay.md")
    expect(describeLayout({ layout: "books" }, { kind: "folder", dir: "A" })).toBe("layout: in the note")
    expect(describeLayout({}, note)).toBe("no layout:")
    expect(describeGroup("books", { layout: "books", group: "year" }, note)).toBe("group: in Writing/Essay.md")
    expect(describeGroup("books", { layout: "books" }, note)).toBe("the default of layout: books")
  })
})

describe("describeLookRule and describeFrameRule", () => {
  test("say where the style comes from", () => {
    expect(describeLookRule({ kind: "note" }, note)).toBe("style: in Writing/Essay.md")
    expect(describeLookRule({ kind: "note" }, { kind: "site" })).toBe("style: in the note")
    expect(describeLookRule({ kind: "layout", layout: "cv" }, note)).toBe("the default of layout: cv")
    expect(describeLookRule({ kind: "tags", tag: "poem" }, note)).toBe("appearance.tags → poem")
    expect(describeLookRule({ kind: "stages", stage: "01_Fleeting" }, note)).toBe("appearance.stages → 01_Fleeting")
    expect(describeLookRule({ kind: "folders", folder: "Writing" }, note)).toBe("appearance.folders → Writing")
    expect(describeLookRule({ kind: "classic", folder: "Writing" }, note)).toBe("appearance.classic → Writing")
    expect(describeLookRule({ kind: "languages", lang: "vi-VN" }, note)).toBe("appearance.languages → vi-VN")
    expect(describeLookRule({ kind: "schedule", from: "01-20", to: "02-20" }, note)).toBe("appearance.schedule → 01-20 to 02-20")
    expect(describeLookRule({ kind: "site" }, note)).toBe("appearance.style")
  })
  test("say where the chrome comes from", () => {
    expect(describeFrameRule({ kind: "note" }, note)).toBe("chrome: in Writing/Essay.md")
    expect(describeFrameRule({ kind: "note" }, { kind: "folder", dir: "A" })).toBe("chrome: in the note")
    expect(describeFrameRule({ kind: "layout", layout: "gallery" }, note)).toBe("the default of layout: gallery")
    expect(describeFrameRule({ kind: "default" }, note)).toBe("the default")
  })
})

describe("configLines", () => {
  test("a note: its frontmatter, or its folder in datme.yaml", () => {
    expect(configLines(note, { style: "garden", chrome: "minimal" })).toEqual([
      { where: "frontmatter of Writing/Essay.md", code: "style: garden\nchrome: minimal" },
      { where: "datme.yaml, for the whole folder", code: "appearance:\n  folders:\n    Writing: garden" },
    ])
  })
  test("a tagged note: its tag in datme.yaml too, between its frontmatter and its folder", () => {
    expect(configLines({ ...note, tag: "poem/haiku" }, { style: "classic", chrome: "minimal" })).toEqual([
      { where: "frontmatter of Writing/Essay.md", code: "style: classic\nchrome: minimal" },
      { where: "datme.yaml, for every note tagged poem/haiku", code: "appearance:\n  tags:\n    poem/haiku: classic" },
      { where: "datme.yaml, for the whole folder", code: "appearance:\n  folders:\n    Writing: classic" },
    ])
    // A tag has nothing to say about a chrome.
    expect(configLines({ ...note, tag: "poem" }, { chrome: "minimal" })).toHaveLength(1)
  })
  test("a note at a stage: its stage in datme.yaml too, after its tag", () => {
    expect(configLines({ ...note, tag: "poem", stage: "01_Fleeting" }, { style: "classic" }).map((l) => l.where)).toEqual([
      "frontmatter of Writing/Essay.md",
      "datme.yaml, for every note tagged poem",
      "datme.yaml, for every note at stage 01_Fleeting",
      "datme.yaml, for the whole folder",
    ])
    expect(configLines({ ...note, stage: "01_Fleeting" }, { style: "classic" })[1].code).toBe("appearance:\n  stages:\n    01_Fleeting: classic")
  })
  test("a note at the vault's root: the whole site instead of a folder", () => {
    expect(configLines({ kind: "note", file: "About.md", dir: "" }, { style: "classic" })).toEqual([
      { where: "frontmatter of About.md", code: "style: classic" },
      { where: "datme.yaml, for the whole site", code: "appearance:\n  style: classic" },
    ])
  })
  test("a folder: its folder note, a new one, or datme.yaml", () => {
    expect(configLines({ kind: "folder", dir: "A/B", file: "A/B/B.md" }, { chrome: "minimal" })).toEqual([
      { where: "frontmatter of A/B/B.md", code: "chrome: minimal" },
    ])
    expect(configLines({ kind: "folder", dir: "A/B" }, { chrome: "minimal" })).toEqual([
      { where: "frontmatter of a new folder note, A/B/B.md", code: "chrome: minimal" },
    ])
    expect(configLines({ kind: "folder", dir: "Ideas: raw" }, { style: "garden" })[1]).toEqual({
      where: "datme.yaml, for the whole folder",
      code: 'appearance:\n  folders:\n    "Ideas: raw": garden',
    })
  })
  test("a layout and a grouping go in the frontmatter, before the style", () => {
    expect(configLines(note, { layout: "books", group: "season|year", style: "garden" })[0]).toEqual({
      where: "frontmatter of Writing/Essay.md",
      code: "layout: books\ngroup: season|year\nstyle: garden",
    })
    expect(configLines(note, { group: "a: b" })[0].code).toBe('group: "a: b"')
    expect(configLines({ kind: "folder", dir: "Books" }, { layout: "books" })).toEqual([
      { where: "frontmatter of a new folder note, Books/Books.md", code: "layout: books" },
    ])
  })
  test("layout none: the line to take out of the note", () => {
    expect(configLines(note, { layout: "none" }, { layout: "cv" })).toEqual([{ where: "frontmatter of Writing/Essay.md, taken out", code: "layout: cv" }])
    expect(configLines({ kind: "folder", dir: "A" }, { layout: "none" }, { layout: "cv" })).toEqual([])
  })
  test("any other page: the site style, and nothing for a chrome", () => {
    expect(configLines({ kind: "site" }, { style: "darkroom", chrome: "minimal" })).toEqual([
      { where: "datme.yaml, for the whole site", code: "appearance:\n  style: darkroom" },
    ])
    expect(configLines({ kind: "site" }, {})).toEqual([])
  })
})
