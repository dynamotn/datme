import { describe, expect, test } from "bun:test"
import { cumulativeByMonth, gardenStats, growthPath } from "../src/lib/stats"

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
})
