import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { audioIndex, audioPath, buildAudioIndex, hasAudio, TTS_FORMAT_VERSION, ttsModel, ttsSelected } from "../src/lib/tts"
import { TtsUnavailable, VIENEU_VERSION } from "../src/lib/tts-engine"
import { noteChunks } from "../src/lib/tts-text"
import { getVault, type Note } from "../src/lib/vault"
import { loadConfig, site, type SiteConfig, type TtsConfig } from "../src/site.config"

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

describe("audio index", () => {
  const VAULT = path.resolve(import.meta.dir, "fixtures/tts/vault")
  const VOICE = path.resolve(import.meta.dir, "fixtures/tts/voice.wav")
  const FAKE = JSON.stringify(["bun", path.resolve(import.meta.dir, "fixtures/tts/fake-engine.ts")])
  const g = globalThis as { __vaultVersion?: number; __datmeAudioIndex?: unknown }
  const env = { ...process.env }
  let saved: SiteConfig

  beforeAll(() => {
    saved = { ...site }
    Object.assign(site, loadConfig(VAULT, {}))
    g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
    process.env.DATME_TTS_CMD = FAKE
  })
  afterEach(() => {
    for (const k of ["DATME_TTS_CMD", "DATME_TTS_VOICE", "FAKE_TTS_NO_START", "DATME_DEV"]) {
      if (env[k] === undefined) delete process.env[k]
      else process.env[k] = env[k]
    }
    process.env.DATME_TTS_CMD = FAKE
    delete g.__datmeAudioIndex
  })
  afterAll(() => {
    for (const k of Object.keys(site)) if (!(k in saved)) delete (site as unknown as Record<string, unknown>)[k]
    Object.assign(site, saved)
    g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
    if (env.DATME_TTS_CMD === undefined) delete process.env.DATME_TTS_CMD
    else process.env.DATME_TTS_CMD = env.DATME_TTS_CMD
  })

  const memory = () => {
    const store = new Map<string, Buffer>()
    return { store, read: (k: string[]) => store.get(JSON.stringify(k)), write: (k: string[], d: Buffer) => void store.set(JSON.stringify(k), d) }
  }
  const build = (o: { cache?: ReturnType<typeof memory>; voice?: string | null; notes?: Record<string, Note[]> } = {}) =>
    buildAudioIndex(o.notes ?? getVault().notes, site.langs, site.tts!, o.voice === null ? undefined : (o.voice ?? VOICE), o.cache ?? memory())

  test("selected notes in a language with a model get audio, without their locked parts", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const index = await build()
      const mp3 = index.get("/Podcast/Episode")?.toString()
      expect(mp3).toContain("Xin chào, đây là tập một.")
      expect(mp3).toContain("Hết tập.")
      expect(mp3).not.toContain("Kho báu")
      // en-US has no model, an English page is not read by the Vietnamese one, other folders are not selected.
      expect([...index.keys()].some((k) => k.startsWith("/en-US/"))).toBe(false)
      expect(index.has("/Podcast/English")).toBe(false)
      expect(index.has("/Other/Plain")).toBe(false)
      // Nothing to read beyond the title: only locked text, or only code.
      expect(index.has("/Podcast/Locked")).toBe(false)
      expect(index.has("/Podcast/Code")).toBe(false)
      // These layouts show no Listen button, so their audio would never be played.
      expect(index.has("/Podcast/Cv")).toBe(false)
      expect(index.has("/Podcast/Links")).toBe(false)
      // Drafts are only in the vault of a --drafts build.
      expect(index.has("/Podcast/Draft")).toBe(false)
      expect(index.has("/Podcast/Broken")).toBe(false)
      expect(warn).toHaveBeenCalledWith("[datme] audio skipped for /Podcast/Broken: boom")
      expect(audioPath(getVault().byKey["vi-VN"].get("Podcast/Episode")!)).toBe("/Podcast/Episode.mp3")
    } finally {
      warn.mockRestore()
    }
  }, 30_000)

  test("cached audio needs no engine; a miss starts it and its failure fails the build", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      // Without the note that fails, so that every note is a hit the second time.
      const all = getVault().notes
      const notes = Object.fromEntries(Object.entries(all).map(([l, ns]) => [l, ns.filter((n) => n.key !== "Podcast/Broken")]))
      const cache = memory()
      const first = await build({ cache, notes })
      expect(first.size).toBe(1)
      expect(cache.store.size).toBe(1)
      const episode = getVault().byKey["vi-VN"].get("Podcast/Episode")!
      const sha = (d: string | Buffer) => createHash("sha256").update(d).digest("hex")
      expect(JSON.parse([...cache.store.keys()][0])).toEqual([
        "vieneu",
        VIENEU_VERSION,
        TTS_FORMAT_VERSION,
        sha(fs.readFileSync(VOICE)),
        sha(JSON.stringify(noteChunks(episode))),
      ])
      process.env.FAKE_TTS_NO_START = "1"
      expect(await build({ cache, notes })).toEqual(first)
      await expect(build({ notes })).rejects.toBeInstanceOf(TtsUnavailable)
      process.env.DATME_TTS_CMD = JSON.stringify(["datme-no-such-command"])
      expect(await build({ cache, notes })).toEqual(first)
      await expect(build({ notes })).rejects.toBeInstanceOf(TtsUnavailable)
    } finally {
      warn.mockRestore()
    }
  }, 30_000)

  test("a missing or unreadable voice sample fails the build", async () => {
    await expect(build({ voice: null })).rejects.toThrow(/DATME_TTS_VOICE is not set/)
    await expect(build({ voice: "/nonexistent/voice.wav" })).rejects.toBeInstanceOf(TtsUnavailable)
    // An empty secret decodes to an empty file: it fails rather than publishing a site without audio.
    const empty = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-voice-")), "voice.ogg")
    fs.writeFileSync(empty, "")
    try {
      await expect(build({ voice: empty })).rejects.toThrow(/DATME_TTS_VOICE .* is empty/)
    } finally {
      fs.rmSync(path.dirname(empty), { recursive: true, force: true })
    }
  })

  test("audioIndex is built once per process, from DATME_TTS_VOICE", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      process.env.DATME_TTS_VOICE = VOICE
      const once = audioIndex()
      expect(audioIndex()).toBe(once)
      expect((await once).has("/Podcast/Episode")).toBe(true)
      const vault = getVault().byKey["vi-VN"]
      expect(await hasAudio(vault.get("Podcast/Episode")!)).toBe(true)
      expect(await hasAudio(vault.get("Other/Plain")!)).toBe(false)
    } finally {
      warn.mockRestore()
    }
  }, 30_000)

  test("audioIndex fails with TtsUnavailable when the voice is unset, and stays failed", async () => {
    delete process.env.DATME_TTS_VOICE
    await expect(audioIndex()).rejects.toBeInstanceOf(TtsUnavailable)
    await expect(audioIndex()).rejects.toBeInstanceOf(TtsUnavailable)
  })

  test("audioIndex is empty without tts, and in dev", async () => {
    process.env.DATME_DEV = "1"
    expect((await audioIndex()).size).toBe(0)
    delete g.__datmeAudioIndex
    delete process.env.DATME_DEV
    const tts = site.tts
    site.tts = undefined
    try {
      expect((await audioIndex()).size).toBe(0)
    } finally {
      site.tts = tts
    }
  })
})
