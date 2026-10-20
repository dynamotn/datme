import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { site, type NavItem } from "../src/site.config"
import { footerColumns, isStream, navLinks, sidebarLinks } from "../src/lib/nav"
import { hasMap, hasTimeline } from "../src/lib/places"
import { hasJournal } from "../src/lib/journal"
import { hasDecks } from "../src/lib/decks"
import { hasChanges } from "../src/lib/changes"

const nav = site.nav
const sidebar = site.sidebar
const footer = site.footer
afterEach(() => {
  site.nav = nav
  site.sidebar = sidebar
  site.footer = footer
})

describe("sidebarLinks", () => {
  test("resolves the sidebar's entries like the menu's", () => {
    // The fixture vault's own shortcuts: a note, a URL, and a note that does not exist.
    expect(sidebarLinks("en-US").map((l) => l.label)).toEqual(["Niklas Luhmann (sociologist)", "A friend's garden"])
    site.sidebar = []
    expect(sidebarLinks("en-US")).toEqual([])
    site.sidebar = [{ kind: "tags" }, { kind: "url", target: "https://example.com", label: { "vi-VN": "Ví dụ", "en-US": "Example" } }]
    expect(sidebarLinks("en-US")).toEqual([
      { label: "Tags", url: "/en-US/tags" },
      { label: "Example", url: "https://example.com" },
    ])
  })
})

describe("footerColumns", () => {
  test("resolves each column like the menu, and drops a column left with no link", () => {
    site.footer = [
      { items: [{ kind: "url", target: "https://example.com", label: { "vi-VN": "Ví dụ", "en-US": "Example" } }] },
      { title: "Explore", items: [{ kind: "tags" }, { kind: "note", target: "Niklas Luhmann" }] },
      { title: "Gone", items: [{ kind: "note", target: "No such note" }] },
    ]
    expect(footerColumns("en-US")).toEqual([
      { title: undefined, links: [{ label: "Example", url: "https://example.com" }] },
      { title: "Explore", links: [{ label: "Tags", url: "/en-US/tags" }, expect.objectContaining({ label: "Niklas Luhmann (sociologist)" })] },
    ])
    expect(footerColumns("vi-VN")[0].links[0].label).toBe("Ví dụ")
  })
})

describe("navLinks of every kind", () => {
  test("site pages, and pages shown only when the vault has something for them", () => {
    const kinds = ["archive", "recent", "stats", "timeline", "map", "calendar", "changes", "practice"] as const
    site.nav = kinds.map((kind): NavItem => ({ kind }))
    const urls = navLinks("en-US").map((l) => l.url)
    const expected = ["/en-US/archive", "/en-US/recent", "/en-US/stats"]
    if (hasTimeline("en-US")) expected.push("/en-US/timeline")
    if (hasMap("en-US")) expected.push("/en-US/map")
    if (hasJournal("en-US")) expected.push("/en-US/calendar")
    if (hasChanges("en-US")) expected.push("/en-US/changes")
    if (hasDecks("en-US")) expected.push("/en-US/practice")
    expect(urls).toEqual(expected)
    // The fixture vault has dated, placed, journal and flashcard notes.
    expect(urls).toContain("/en-US/timeline")
    expect(urls).toContain("/en-US/map")
    expect(navLinks("en-US")[0].label).toBe("Archive")
  })

  test("a URL keeps its own label per language; a missing note is warned about once", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      site.nav = [
        { kind: "url", target: "https://example.com", label: { "vi-VN": "Ví dụ", "en-US": "Example" } },
        { kind: "note", target: "No such note anywhere" },
      ]
      expect(navLinks("vi-VN")).toEqual([{ label: "Ví dụ", url: "https://example.com" }])
      expect(navLinks("en-US")).toEqual([{ label: "Example", url: "https://example.com" }])
      expect(warn.mock.calls.filter((c) => String(c[0]).includes("No such note anywhere"))).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  test("a note without its own label takes the note's title", () => {
    site.nav = [{ kind: "note", target: "Niklas Luhmann" }]
    expect(navLinks("vi-VN")).toEqual([{ label: expect.any(String), url: "/06_Reference/Niklas-Luhmann" }])
  })
})

describe("isStream", () => {
  test("a stream folder and the folders inside it, not its look-alikes", () => {
    expect(site.appearance.stream).toContain("08_Journal")
    expect(isStream("08_Journal")).toBe(true)
    expect(isStream("08_Journal/2024")).toBe(true)
    expect(isStream("08_Journalism")).toBe(false)
    expect(isStream("")).toBe(false)
  })
})
