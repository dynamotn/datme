import { describe, expect, test } from "bun:test"
import { checkVault, countProblems, formatReport, summarize } from "../src/lib/check"

const problems = checkVault()
const messages = (file: string) => problems.filter((p) => p.file === file).map((p) => `${p.level}: ${p.message}`)

describe("datme check", () => {
  test("a link to a note that does not exist is an error", () => {
    expect(messages("03_Atomic/Zettelkasten.md")).toContain('error: link to missing note "Missing note"')
  })

  test("a link to a private note is only informational", () => {
    expect(messages("03_Atomic/Zettelkasten.md")).toContain('info: link to unpublished note "Private" is shown as plain text')
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
    expect(summarize({ error: 1, warning: 2, info: 1 })).toBe("1 error, 2 warnings, 1 link to unpublished notes")
    expect(formatReport(problems)).not.toContain('"Private"')
    expect(formatReport(problems, true)).toContain('"Private"')
    expect(formatReport(problems)).toEndWith(
      `${summarize(counts)}\nLinks to unpublished notes are expected in a private vault; "--verbose" lists them.`,
    )
  })
})
