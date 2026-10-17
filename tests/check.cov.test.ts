import { describe, expect, test } from "bun:test"
import { externalLinks, formatPrivacy, formatReport, gardenShape, privacyReport, structureProblems, type PrivacyReport } from "../src/lib/check"
import { getVault } from "../src/lib/vault"
import type { LinkRef } from "../src/lib/obsidian"
import { site } from "../src/site.config"

describe("hubs in the garden", () => {
  test("a note linking to far more notes than the others is reported as a hub", () => {
    const note = getVault().notes[site.defaultLang].find((n) => n.key === "07_Project/Poem")!
    const before = note.links
    const fake = Array.from({ length: 40 }, (_, i) => ({ ...before[0], key: `fake/${i}` }) as LinkRef)
    note.links = [...before, ...fake]
    try {
      const { hubs, median } = gardenShape(site.defaultLang)
      expect(hubs.map((h) => h.note.key)).toEqual(["07_Project/Poem"])
      const hub = structureProblems().find((p) => p.message.startsWith("hub:"))!
      expect(hub.file).toBe("07_Project/Poem.md")
      expect(hub.message).toBe(
        `hub: links to ${hubs[0].links} notes, ${Math.round(hubs[0].links / median)} times the median of ${median}; a map of content could split it`,
      )
    } finally {
      note.links = before
    }
    expect(gardenShape(site.defaultLang).hubs).toEqual([])
  })
})

describe("reports", () => {
  test("a report with only notices still ends with the summary and the hint", () => {
    const report = formatReport([{ level: "info", file: "a.md", message: "orphan" }])
    expect(report).toBe(
      '0 errors, 0 warnings, 1 notice\nNotices (links to unpublished notes, scheduled notes, orphans, dead ends, hubs) are expected; "--verbose" lists them.',
    )
    expect(formatReport([], true)).toBe("0 errors, 0 warnings")
    const problems = [
      { level: "error" as const, file: "a.md", message: "broken" },
      { level: "info" as const, file: "a.md", message: "orphan" },
      { level: "warning" as const, file: "b.md", message: "odd" },
    ]
    expect(formatReport(problems, true)).toBe("a.md\n  error   broken\n  info    orphan\n\nb.md\n  warning odd\n\n1 error, 1 warning, 1 notice")
  })

  test("external links name each linking file once", () => {
    for (const files of externalLinks().values()) expect(new Set(files).size).toBe(files.length)
  })

  test("the privacy report of the fixture vault is sorted", () => {
    const r = privacyReport()
    const sorted = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b))
    expect(r.notes.map((n) => n.file)).toEqual(sorted(r.notes.map((n) => n.file)))
    expect(r.properties.map((p) => p.key)).toEqual(sorted(r.properties.map((p) => p.key)))
    expect(r.docs.length).toBeGreaterThan(0)
  })

  test("the privacy text marks protected and unlisted notes, counts shared properties, and says none when empty", () => {
    const r: PrivacyReport = {
      notes: [{ file: "a.md", url: "/a", protected: true, unlisted: true }],
      docs: [{ file: "Map.canvas", url: "/Map" }],
      files: [],
      properties: [
        { key: "one", files: ["a.md"] },
        { key: "many", files: ["a.md", "b.md"] },
      ],
      privateLinks: [{ file: "a.md", target: "Secret", shown: "" }],
      hosts: [{ host: "tiles.example", why: "map tiles" }],
    }
    expect(formatPrivacy(r)).toBe(
      [
        "Published notes (1)",
        "  a.md  /a  [password]  [unlisted]",
        "",
        "Canvases, bases and drawings (1)",
        "  Map.canvas  /Map",
        "",
        "Files copied (0)",
        "  none",
        "",
        "Properties shown (2)",
        "  one: a.md",
        "  many: 2 notes",
        "",
        "Links to private notes (1)",
        '  a.md  "Secret" shows nothing',
        "",
        "Outside hosts (1)",
        "  tiles.example  map tiles",
      ].join("\n"),
    )
  })
})
