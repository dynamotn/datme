import { describe, expect, test } from "bun:test"
import { configLines, describeFrameRule, describeLookRule, keepRequestUrl, pageUrl, previewOf, previewUrl, type LookTarget } from "../src/lib/dev-look"

const page = (q = "") => new URL(`http://localhost:4321/notes/a/${q}`)
const note: LookTarget = { kind: "note", file: "Writing/Essay.md", dir: "Writing" }

describe("previewOf", () => {
  test("reads a known style and chrome under datme dev", () => {
    expect(previewOf(page("?style=Garden&chrome=minimal"), true)).toEqual({ style: "garden", chrome: "minimal" })
  })
  test("drops unknown values", () => {
    expect(previewOf(page("?style=fancy&chrome=full-norail"), true)).toEqual({ style: undefined, chrome: undefined })
    expect(previewOf(page(), true)).toEqual({ style: undefined, chrome: undefined })
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
    expect(preview).toEqual({ style: "garden", chrome: undefined })
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

describe("describeLookRule and describeFrameRule", () => {
  test("say where the style comes from", () => {
    expect(describeLookRule({ kind: "note" }, note)).toBe("style: in Writing/Essay.md")
    expect(describeLookRule({ kind: "note" }, { kind: "site" })).toBe("style: in the note")
    expect(describeLookRule({ kind: "layout", layout: "cv" }, note)).toBe("the default of layout: cv")
    expect(describeLookRule({ kind: "tags", tag: "poem" }, note)).toBe("appearance.tags → poem")
    expect(describeLookRule({ kind: "folders", folder: "Writing" }, note)).toBe("appearance.folders → Writing")
    expect(describeLookRule({ kind: "classic", folder: "Writing" }, note)).toBe("appearance.classic → Writing")
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
  test("any other page: the site style, and nothing for a chrome", () => {
    expect(configLines({ kind: "site" }, { style: "darkroom", chrome: "minimal" })).toEqual([
      { where: "datme.yaml, for the whole site", code: "appearance:\n  style: darkroom" },
    ])
    expect(configLines({ kind: "site" }, {})).toEqual([])
  })
})
