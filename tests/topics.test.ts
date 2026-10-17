import { afterAll, describe, expect, test } from "bun:test"
import { clusterTopics, topicCount, topicOf, topics } from "../src/lib/topics"
import { resolveConfig, site } from "../src/site.config"
import { setEmbedder } from "../src/lib/embeddings"
import { gardenStats } from "../src/lib/stats"

const unit = (v: number[]) => {
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
}
const item = (key: string, v: number[], tags: string[] = []) => ({ key, title: key, tags, vector: unit(v) })

describe("topic map", () => {
  const items = [
    item("Roses", [1, 0.1, 0], ["garden"]),
    item("Tulips", [0.9, 0.2, 0], ["garden"]),
    item("Compost", [1, 0, 0.1], ["garden", "type/howto"]),
    item("Rust", [0, 1, 0.1], ["code"]),
    item("Go", [0.1, 1, 0], ["code"]),
    item("Haiku", [0, 0.1, 1]),
  ]

  test("notes about the same thing fall in the same topic, named after their shared tag", () => {
    const t = clusterTopics(items, 3)
    expect(t.map((x) => [x.label, x.items.map((i) => i.key).sort()])).toEqual([
      ["#garden", ["Compost", "Roses", "Tulips"]],
      ["#code", ["Go", "Rust"]],
      ["Haiku", ["Haiku"]],
    ])
  })

  test("the same notes give the same topics, whatever their order", () => {
    const a = clusterTopics(items, 3).map((t) => t.label)
    const b = clusterTopics([...items].reverse(), 3).map((t) => t.label)
    expect(b).toEqual(a)
  })

  test("type tags never name a topic, and topics without a shared tag take their most central note's title", () => {
    const t = clusterTopics([item("A", [1, 0], ["type/book"]), item("B", [0.9, 0.1], ["type/book"])], 2)
    expect(t.every((x) => !x.label.startsWith("#type"))).toBe(true)
  })

  test("how many topics grows slowly with the garden, between 2 and 12", () => {
    expect(topicCount(4)).toBe(2)
    expect(topicCount(200)).toBe(10)
    expect(topicCount(10_000)).toBe(12)
  })

  test("no topics without semantic related notes; topics can be turned off or counted", async () => {
    expect(await topics("vi-VN")).toEqual([])
    expect(resolveConfig({}, "/v").topics).toBe(true)
    expect(resolveConfig({ topics: 6 }, "/v").topics).toBe(6)
    expect(resolveConfig({ topics: false }, "/v").topics).toBe(false)
  })
})

describe("topics of the fixture garden", () => {
  const before = site.related.semantic
  afterAll(() => {
    site.related.semantic = before
    setEmbedder(undefined)
  })

  test("with semantic related notes on, every listed public note gets a topic, shown on /stats", async () => {
    // A stand-in for the model: notes about Luhmann or the slip box point one way, the rest another.
    setEmbedder(async (texts) => texts.map((t) => unit(/luhmann|zettel|slip/i.test(t) ? [1, 0.1, 0.05] : [0.05, 0.1, 1])))
    site.related.semantic = { model: "test-model", threshold: 0.55 }
    const list = await topics("en-US")
    expect(list.length).toBeGreaterThanOrEqual(2)
    const byKey = await topicOf("en-US")
    expect(byKey.get("03_Atomic/Zettelkasten")).toBe(byKey.get("06_Reference/Niklas Luhmann"))
    expect(byKey.has("06_Reference/Secret")).toBe(false)
    const { health } = await gardenStats("en-US")
    expect(health.topics!.map((t) => t.label)).toEqual(list.map((t) => t.label))
    expect(health.topics!.flatMap((t) => t.notes.map((n) => n.url))).toContain("/en-US/03_Atomic/Zettelkasten-method")
  })
})
