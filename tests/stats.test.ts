import { describe, expect, test } from "bun:test"
import { cumulativeByMonth, densityByMonth, freshnessCounts, gardenStats, growthPath } from "../src/lib/stats"

describe("stats", () => {
  test("growth counts notes by month, empty months included", () => {
    const d = (s: string) => new Date(s)
    expect(cumulativeByMonth([d("2024-01-15"), d("2024-03-02"), d("2024-01-20"), d("2023-12-31")])).toEqual([
      ["2023-12", 1],
      ["2024-01", 3],
      ["2024-02", 3],
      ["2024-03", 4],
    ])
    expect(cumulativeByMonth([])).toEqual([])
  })

  test("the curve fills the box, ending at the top", () => {
    expect(growthPath([["2024-01", 1], ["2024-02", 2]], 100, 50)).toBe("M0.0,25.0 L100.0,0.0")
  })

  test("the fixture garden in numbers", async () => {
    const st = await gardenStats("vi-VN")
    expect(st.notes).toBeGreaterThan(5)
    expect(st.words).toBeGreaterThan(50)
    expect(st.links).toBeGreaterThan(0)
    expect(st.topTags[0]).toEqual({ tag: "theme", count: expect.any(Number) })
    expect(st.folders.some((f) => f.label.includes("Nguyên tử"))).toBe(true)
  })

  test("density counts the links among notes planted by the end of each month", () => {
    const d = (s: string) => new Date(s)
    const notes = [
      { key: "a", created: d("2024-01-10"), links: ["b"] },
      { key: "b", created: d("2024-02-10"), links: ["a", "c"] },
      { key: "c", created: d("2024-03-10"), links: [] },
    ]
    // January: a links to b, not planted yet. February: a→b and b→a. March: b→c too.
    expect(densityByMonth(notes)).toEqual([
      ["2024-01", 0],
      ["2024-02", 1],
      ["2024-03", 1],
    ])
  })

  test("freshness counts notes tended within each span", () => {
    const now = new Date("2026-10-17").getTime()
    const dates = [new Date("2026-10-10"), new Date("2026-08-01"), new Date("2024-01-01"), undefined]
    expect(freshnessCounts(dates, [30, 90, 365], now)).toEqual([
      { days: 30, notes: 1 },
      { days: 90, notes: 2 },
      { days: 365, notes: 2 },
    ])
  })

  test("the fixture garden's health: density, orphans and dead ends, freshness, most linked notes", async () => {
    const { health } = await gardenStats("vi-VN")
    expect(health.density!.now).toBeGreaterThan(0)
    expect(health.density!.trend.length).toBeGreaterThan(0)
    expect(health.structure!.deadEnds).toBeGreaterThan(0)
    expect(health.freshness!.map((f) => f.days)).toEqual([30, 90, 365])
    expect(health.hubs![0].count).toBeGreaterThanOrEqual(health.hubs!.at(-1)!.count)
    expect(health.hubs!.map((h) => h.title)).toContain("Zettelkasten")
  })
})
