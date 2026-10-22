import { describe, expect, spyOn, test } from "bun:test"
import {
  accentProblems,
  checkVault,
  externalLinks,
  formatPrivacy,
  formatReport,
  gardenShape,
  layoutProblems,
  privacyReport,
  stylesInUse,
  structureProblems,
  type PrivacyReport,
} from "../src/lib/check"
import * as hints from "../src/lib/layout-hints"
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

describe("suggested layouts", () => {
  test("are notices on the note, or on a folder without a folder note", () => {
    const suggest = spyOn(hints, "suggestLayouts").mockReturnValue([
      { file: "Talk.md", layout: "dialogue", score: 0.9, reason: "9 of 10 paragraphs start with a speaker's name" },
      { file: "Reading/Reading.md", layout: "books", score: 1, reason: "5 of 5 notes have an author", folder: "Reading", create: true },
      { file: "Films/Films.md", layout: "movies", score: 1, reason: "4 of 4 notes name a director", folder: "Films" },
    ])
    try {
      expect(layoutProblems()).toEqual([
        { level: "info", file: "Talk.md", message: "suggested layout: dialogue: 9 of 10 paragraphs start with a speaker's name" },
        {
          level: "info",
          file: "Reading",
          message: "suggested layout: books, listing Reading/ as a collection from a new folder note Reading/Reading.md: 5 of 5 notes have an author",
        },
        { level: "info", file: "Films/Films.md", message: "suggested layout: movies, listing Films/ as a collection: 4 of 4 notes name a director" },
      ])
    } finally {
      suggest.mockRestore()
    }
  })

  test("check.layouts: false turns them off", () => {
    const suggest = spyOn(hints, "suggestLayouts").mockReturnValue([{ file: "Talk.md", layout: "dialogue", score: 1, reason: "r" }])
    const before = site.check.layouts
    try {
      expect(checkVault().some((p) => p.message.startsWith("suggested layout"))).toBe(true)
      site.check.layouts = false
      expect(checkVault().some((p) => p.message.startsWith("suggested layout"))).toBe(false)
    } finally {
      site.check.layouts = before
      suggest.mockRestore()
    }
  })
})

describe("reports", () => {
  test("a report with only notices still ends with the summary and the hint", () => {
    const report = formatReport([{ level: "info", file: "a.md", message: "orphan" }])
    expect(report).toBe(
      '0 errors, 0 warnings, 1 notice\nNotices (links to unpublished notes, scheduled notes, orphans, dead ends, hubs, suggested layouts) are expected; "--verbose" lists them.',
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
      propertiesListed: false,
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
        "  Every key not hidden is shown; properties.show in datme.yaml shares only the keys it lists.",
        "",
        "Links to private notes (1)",
        '  a.md  "Secret" shows nothing',
        "",
        "Outside hosts (1)",
        "  tiles.example  map tiles",
      ].join("\n"),
    )
    // With an allow-list, the keys shown are the ones the author chose: no advice.
    expect(formatPrivacy({ ...r, propertiesListed: true })).not.toContain("properties.show")
  })
})

describe("the accent against the grounds of the styles in use", () => {
  test("the styles of the config and of the notes, once each", () => {
    // The fixture's site style, its garden folder, and its classic folder through the notes in it.
    expect(stylesInUse().sort()).toEqual(["classic", "garden", "notebook"])
  })
  test("a style the schedule or a language gives is in use too", () => {
    const { schedule, languages } = site.appearance
    site.appearance.schedule = [{ style: "lacquer", from: "01-20", to: "02-20" }]
    site.appearance.languages = { "en-US": "terminal" }
    try {
      expect(stylesInUse()).toContain("lacquer")
      expect(stylesInUse()).toContain("terminal")
    } finally {
      Object.assign(site.appearance, { schedule, languages })
    }
  })
  test("the fixture's accent passes", () => {
    expect(accentProblems(site.theme.accent, stylesInUse(), "datme.yaml")).toEqual([])
    expect(checkVault().some((p) => p.message.startsWith("theme.accent"))).toBe(false)
    expect(accentProblems(undefined, ["notebook"], "datme.yaml")).toEqual([])
  })
  test("a faint accent is a warning per scheme with its ratio on each ground and one that passes", () => {
    const [light, dark] = accentProblems("#ffcc00", ["notebook", "lacquer"], "datme.yaml")
    expect(light).toEqual({
      level: "warning",
      file: "datme.yaml",
      message:
        "theme.accent #ffcc00 is too faint for text on the light ground of notebook (1.3:1 on #f5f5f0), lacquer (1.2:1 on #f4ecdb): WCAG AA asks for 4.5:1; #826800 passes",
    })
    // Gold reads well on black lacquer and the notebook's dark ground.
    expect(dark).toBeUndefined()
  })
  test("one accent per scheme, a pack's style read on its base, and text set on a mid-toned accent", () => {
    const problems = accentProblems({ light: "#777777", dark: "#333" }, ["garden"], ".datme/themes/ink/theme.yaml")
    expect(problems.map((p) => p.message)).toEqual([
      "theme.accent.light #777777 is too faint for text on the light ground of garden (4.0:1 on #f7f3e8): WCAG AA asks for 4.5:1; #6f6f6f passes",
      "theme.accent.light #777777 is too mid-toned for the text set on it (4.4:1 with #fff): WCAG AA asks for 4.5:1; a darker or lighter accent reads better",
      "theme.accent.dark #333 is too faint for text on the dark ground of garden (1.4:1 on #121a14): WCAG AA asks for 4.5:1; #818181 passes",
    ])
    expect(problems[0].file).toBe(".datme/themes/ink/theme.yaml")
    // A colour the check cannot read is left alone.
    expect(accentProblems("teal", ["notebook"], "datme.yaml")).toEqual([])
  })
})
