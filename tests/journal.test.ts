import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { dailyFormat, dateMatcher, dayNeighbours, journal, months } from "../src/lib/journal"
import { getVault } from "../src/lib/vault"

describe("daily note names", () => {
  test("moment.js formats, with folders, names and literal text", () => {
    expect(dateMatcher("YYYY-MM-DD")("2026-10-07")).toBe("2026-10-07")
    expect(dateMatcher("YYYY/MM/YYYY-MM-DD")("2026/10/2026-10-07")).toBe("2026-10-07")
    expect(dateMatcher("DD.MM.YYYY")("07.10.2026")).toBe("2026-10-07")
    expect(dateMatcher("YYYY-MM-DD dddd")("2026-10-07 Wednesday")).toBe("2026-10-07")
    expect(dateMatcher("MMMM Do, YYYY")("October 7th, 2026")).toBe("2026-10-07")
    expect(dateMatcher("[Day] YYYY-MM-DD")("Day 2026-10-07")).toBe("2026-10-07")
  })

  test("what is not a day is not one", () => {
    expect(dateMatcher("YYYY-MM-DD")("2026-02-30")).toBeUndefined()
    expect(dateMatcher("YYYY-MM-DD")("Ideas")).toBeUndefined()
    expect(dateMatcher("YYYY-MM-DD")("2026-10-07 notes")).toBeUndefined()
  })

  test("settings come from Periodic Notes, then Daily notes, then the defaults", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-daily-"))
    expect(dailyFormat(dir)).toEqual({ folder: "", format: "YYYY-MM-DD" })
    fs.mkdirSync(path.join(dir, ".obsidian/plugins/periodic-notes"), { recursive: true })
    fs.writeFileSync(path.join(dir, ".obsidian/daily-notes.json"), '{"folder":"/Daily/","format":"DD.MM.YYYY"}')
    expect(dailyFormat(dir)).toEqual({ folder: "Daily", format: "DD.MM.YYYY" })
    fs.writeFileSync(path.join(dir, ".obsidian/plugins/periodic-notes/data.json"), '{"daily":{"enabled":true,"format":"YYYY/MM/YYYY-MM-DD","folder":"Journal"}}')
    expect(dailyFormat(dir)).toEqual({ folder: "Journal", format: "YYYY/MM/YYYY-MM-DD" })
  })
})

describe("the journal of the vault", () => {
  test("daily notes in their folder, oldest first; other notes are not days", () => {
    expect(journal("en-US").map((d) => d.date)).toEqual(["2026-09-28", "2026-10-05", "2026-10-07"])
  })

  test("each day links to the days before and after it", () => {
    const note = getVault().byKey["en-US"].get("08_Journal/2026-10-05")!
    const days = dayNeighbours(note)!
    expect(days.day).toBe("2026-10-05")
    expect(days.prev?.date).toBe("2026-09-28")
    expect(days.next?.date).toBe("2026-10-07")
    expect(dayNeighbours(getVault().byKey["en-US"].get("08_Journal/Garden plans")!)).toBeUndefined()
  })

  test("month grids start on Monday, newest month first", () => {
    const [oct, sep] = months(journal("en-US"))
    expect([oct.year, oct.month, sep.month]).toEqual([2026, 10, 9])
    // 1 October 2026 is a Thursday.
    expect(oct.weeks[0].slice(0, 4).map((c) => c?.day ?? null)).toEqual([null, null, null, 1])
    expect(oct.weeks.flat().filter((c) => c?.note).map((c) => c!.day)).toEqual([5, 7])
    expect(oct.weeks.every((w) => w.length === 7)).toBe(true)
  })
})
