import { describe, expect, test } from "bun:test"
import { checkVault, countProblems, formatReport, isHub, linkMedian, structureProblems, summarize } from "../src/lib/check"
import { site } from "../src/site.config"

const problems = checkVault()
const messages = (file: string) => problems.filter((p) => p.file === file).map((p) => `${p.level}: ${p.message}`)

describe("datme check", () => {
  test("a link to a note that does not exist is an error", () => {
    expect(messages("03_Atomic/Zettelkasten.md")).toContain('error: link to missing note "Missing note"')
  })

  test("a link to a private note is only informational", () => {
    expect(messages("03_Atomic/Zettelkasten.md")).toContain(
      'info: link to unpublished note "Private" shows its name as plain text; privateLinks: placeholder or hide keeps it off the site',
    )
  })

  test("broken frontmatter is reported, since the note silently stays private", () => {
    const [p] = messages("01_Fleeting/Broken frontmatter.md")
    expect(p).toStartWith("warning: frontmatter is not valid YAML")
  })

  test("menu entries pointing at missing notes are reported against datme.yaml", () => {
    expect(messages("datme.yaml")).toEqual(['warning: nav: no published note matches "Missing note"'])
  })

  test("resolved links, embeds and exported drawings are not problems", () => {
    expect(problems.some((p) => /Niklas|diagram|Flow|Library/.test(p.message))).toBe(false)
  })

  test("the report hides private links unless verbose, and ends with a summary", () => {
    const counts = countProblems(problems)
    expect(summarize({ error: 1, warning: 2, info: 1 })).toBe("1 error, 2 warnings, 1 notice")
    expect(formatReport(problems)).not.toContain('"Private"')
    expect(formatReport(problems, true)).toContain('"Private"')
    expect(formatReport(problems)).toEndWith(
      `${summarize(counts)}\nNotices (links to unpublished notes, scheduled notes, orphans, dead ends, hubs) are expected; "--verbose" lists them.`,
    )
  })
})

describe("structure notices", () => {
  test("a note no one links to, outside the menu, is an orphan", () => {
    expect(messages("03_Atomic/Queries.md")).toContain("info: orphan: no published note links here, and the menu does not either")
  })

  test("notes linked from others, or from the menu, the home page, daily and folder notes are not orphans", () => {
    for (const file of ["03_Atomic/Zettelkasten.md", "06_Reference/Niklas Luhmann.md", "index.md", "08_Journal/2026-10-05.md", "01_Fleeting/01_Fleeting.md"]) {
      expect(messages(file).some((m) => m.includes("orphan"))).toBe(false)
    }
  })

  test("a note linking nowhere is a dead end; daily notes are not", () => {
    expect(messages("07_Project/Poem.md")).toContain("info: dead end: links to no published note")
    expect(messages("08_Journal/2026-10-07.md").some((m) => m.includes("dead end"))).toBe(false)
  })

  test("check.structure: false leaves them out", () => {
    const before = site.check.structure
    site.check.structure = false
    try {
      expect(checkVault().some((p) => /^(orphan|dead end|hub):/.test(p.message))).toBe(false)
    } finally {
      site.check.structure = before
    }
  })
})

describe("hubs", () => {
  test("a note with five times the median links, and at least fifteen, is a hub", () => {
    expect(linkMedian([0, 0, 2, 3, 3, 40])).toBe(3)
    expect(isHub(40, 3)).toBe(true)
    expect(isHub(14, 2)).toBe(false)
    expect(isHub(20, 5)).toBe(false)
    expect(isHub(20, 0)).toBe(false)
    // The fixture garden is small: no note reaches fifteen links.
    expect(structureProblems().filter((p) => p.message.startsWith("hub:"))).toEqual([])
  })
})
