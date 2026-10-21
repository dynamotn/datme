import { describe, expect, test } from "bun:test"
import { gardenChips, gardenOrder, seasonOf, stageOf, tileSize, topTags } from "../src/lib/garden"
import { listed } from "../src/lib/vault"
import { site } from "../src/site.config"

const s = (keys: string[]) => Object.fromEntries(keys.map((k, i) => [k, { icon: "x", label: {}, order: i }]))

describe("garden data", () => {
  test("tile size follows maturity rank", () => {
    const three = s(["seed", "sprout", "tree", "old"])
    expect(tileSize("seed", three)).toBe("small")
    expect(tileSize("tree", three)).toBe("medium")
    expect(tileSize("old", three)).toBe("large")
    expect(tileSize(undefined, three)).toBe("medium")
    expect(tileSize("nope", three)).toBe("medium")
    expect(tileSize("a", s(["a", "b"]))).toBe("small")
    expect(tileSize("b", s(["a", "b"]))).toBe("large")
    expect(tileSize("a", s(["a"]))).toBe("medium")
    expect(tileSize("a", {})).toBe("medium")
  })

  test("the garden opens on its most mature note and mixes stages, newest first within each", () => {
    const d = (x: string) => new Date(x)
    const notes = [
      { k: 1, stage: "seed", updated: d("2026-10-10") },
      { k: 2, stage: "tree", updated: d("2026-01-01") },
      { k: 3, stage: "tree", updated: d("2026-05-01") },
      { k: 4, stage: undefined, updated: d("2026-10-16") },
      { k: 5, stage: "tree", updated: undefined },
    ]
    expect(gardenOrder(notes, s(["seed", "tree"])).map((n) => n.k)).toEqual([3, 1, 4, 2, 5])
  })

  test("chips list the stages that have notes, in stage order", () => {
    const notes = listed("en-US")
    const chips = gardenChips(notes, "en-US")
    expect(chips.every((c) => c.kind === "stage" && c.count > 0)).toBe(true)
    const first = Object.keys(site.stages).find((k) => notes.some((n) => n.stage === k))
    expect(first).toBeDefined()
    expect(chips[0].value).toBe(first as string)
  })

  test("without stages, chips are the top-level folders", () => {
    const notes = listed("en-US")
    const chips = gardenChips(notes, "en-US", {})
    const folders = new Set(notes.map((n) => n.dir.split("/")[0]).filter(Boolean))
    expect(chips.length).toBe(folders.size)
    expect(chips.every((c) => c.kind === "folder" && c.icon === "📁" && c.count > 0)).toBe(true)
  })

  test("a note's stage comes from the config, when it has one", () => {
    const stages = s(["seed", "tree"])
    expect(stageOf({ stage: "tree" }, stages)).toBe(stages.tree)
    expect(stageOf({ stage: "gone" }, stages)).toBeUndefined()
    expect(stageOf({ stage: undefined }, stages)).toBeUndefined()
    const first = Object.keys(site.stages)[0]
    expect(stageOf({ stage: first })).toBe(site.stages[first])
  })

  test("seasons follow the months of each hemisphere", () => {
    const month = (m: number) => new Date(2026, m, 15)
    expect([...Array(12).keys()].map((m): string => seasonOf(month(m)))).toEqual([
      ...["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer"],
      ...["autumn", "autumn", "autumn", "winter"],
    ])
    expect(seasonOf(month(0), "south")).toBe("summer")
    expect(seasonOf(month(3), "south")).toBe("autumn")
    expect(seasonOf(month(6), "south")).toBe("winter")
    expect(seasonOf(month(9), "south")).toBe("spring")
  })

  test("top tags leave type tags out", () => {
    expect(topTags([{ tags: ["a", "type/book", "b"] }, { tags: ["a"] }])).toEqual([
      { tag: "a", count: 2 },
      { tag: "b", count: 1 },
    ])
  })
})
