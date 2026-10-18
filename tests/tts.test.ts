import { describe, expect, test } from "bun:test"
import { ttsModel, ttsSelected } from "../src/lib/tts"
import type { Note } from "../src/lib/vault"
import type { TtsConfig } from "../src/site.config"

const cfg = (over: Partial<TtsConfig> = {}): TtsConfig => ({ models: { vi: "vieneu" }, folders: [], frontmatter: {}, ...over })

function note(o: { dir?: string; fm?: Record<string, unknown>; tags?: string[]; protected?: boolean }): Note {
  return { protected: o.protected ?? false, tags: o.tags ?? [], source: { dir: o.dir ?? "", fm: o.fm ?? {} } } as unknown as Note
}

describe("ttsModel", () => {
  test("exact key, then base language, nothing else", () => {
    expect(ttsModel("vi-VN", cfg())).toBe("vieneu")
    expect(ttsModel("vi", cfg({ models: { "vi-VN": "vieneu" } }))).toBeUndefined()
    expect(ttsModel("en-US", cfg())).toBeUndefined()
    expect(ttsModel("vi-VN", cfg({ models: { "vi-VN": "vieneu" } }))).toBe("vieneu")
  })
})

describe("ttsSelected", () => {
  const folders = cfg({ folders: ["Podcast"] })
  test("folder matches itself and subfolders only", () => {
    expect(ttsSelected(note({ dir: "Podcast" }), folders)).toBe(true)
    expect(ttsSelected(note({ dir: "Podcast/Sub" }), folders)).toBe(true)
    expect(ttsSelected(note({ dir: "Podcasts" }), folders)).toBe(false)
    expect(ttsSelected(note({ dir: "" }), folders)).toBe(false)
  })
  test("frontmatter scalar and array matches", () => {
    const audio = cfg({ frontmatter: { audio: true } })
    expect(ttsSelected(note({ fm: { audio: true } }), audio)).toBe(true)
    expect(ttsSelected(note({ fm: { audio: false } }), audio)).toBe(false)
    expect(ttsSelected(note({}), audio)).toBe(false)
    const type = cfg({ frontmatter: { type: "podcast" } })
    expect(ttsSelected(note({ fm: { type: ["podcast", "essay"] } }), type)).toBe(true)
    expect(ttsSelected(note({ fm: { type: ["essay"] } }), type)).toBe(false)
  })
  test("tags match exactly or as a parent tag", () => {
    const tags = cfg({ frontmatter: { tags: "podcast" } })
    expect(ttsSelected(note({ tags: ["podcast/ep1"] }), tags)).toBe(true)
    expect(ttsSelected(note({ tags: ["podcast"] }), tags)).toBe(true)
    expect(ttsSelected(note({ tags: ["podcasts"] }), tags)).toBe(false)
    expect(ttsSelected(note({ tags: [] }), cfg({ frontmatter: { tags: 1 } }))).toBe(false)
  })
  test("protected notes are never selected", () => {
    expect(ttsSelected(note({ dir: "Podcast", protected: true }), folders)).toBe(false)
  })
})
