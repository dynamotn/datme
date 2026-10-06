import { describe, expect, test } from "bun:test"
import { load as loadYaml } from "js-yaml"
import { getVault, isPublished } from "../src/lib/vault"
import { deployFiles } from "../src/lib/deploy"

describe("scheduled publishing", () => {
  const now = new Date("2024-05-10T12:00:00Z")

  test("a note waits for its publish_date, then publishes like any other", () => {
    expect(isPublished({ publish: true, publish_date: "2024-06-01" }, "explicit", now)).toBe(false)
    expect(isPublished({ publish: true, publishDate: "2024-05-01" }, "explicit", now)).toBe(true)
    expect(isPublished({ publish_date: "2024-06-01" }, "all", now)).toBe(false)
    // The date never overrides publish: false or a draft.
    expect(isPublished({ publish: false, publish_date: "2024-01-01" }, "explicit", now)).toBe(false)
  })

  test("check lists scheduled notes with their day, and they are not in the vault yet", () => {
    const vault = getVault()
    expect(vault.sources.has("01_Fleeting/Future")).toBe(false)
    expect(vault.problems).toContainEqual({ level: "info", file: "01_Fleeting/Future.md", message: "scheduled: published from 2999-01-01" })
  })

  test("generated GitHub workflows also build daily, so scheduled notes appear on time", () => {
    const opts = { vault: ".", branch: "main", project: "p" }
    for (const target of ["github", "cloudflare"] as const) {
      const wf = loadYaml(deployFiles(target, opts)[0].content) as { on: { schedule: { cron: string }[] } }
      expect(wf.on.schedule[0].cron).toMatch(/^\d+ \d+ \* \* \*$/)
    }
    expect(deployFiles("gitlab", opts)[0].content).toContain('$CI_PIPELINE_SOURCE == "schedule"')
  })
})
