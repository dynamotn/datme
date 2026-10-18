import crypto from "node:crypto"
import fs from "node:fs"
import { site, type Lang, type TtsConfig } from "../site.config"
import { stableCacheFile, writeStableCache } from "./render-cache"
import { engineId, startEngine, TtsUnavailable, type TtsEngine } from "./tts-engine"
import { noteChunks } from "./tts-text"
import { getVault, type Note } from "./vault"

export function ttsModel(lang: string, tts: TtsConfig): "vieneu" | undefined {
  return tts.models[lang] ?? tts.models[lang.split("-")[0]]
}

export function ttsSelected(n: Note, tts: TtsConfig): boolean {
  if (n.protected) return false
  const dir = n.source.dir
  if (tts.folders.some((f) => dir === f || dir.startsWith(f + "/"))) return true
  return Object.entries(tts.frontmatter).some(([key, want]) => {
    if (key === "tags") {
      const w = String(want)
      return n.tags.some((t) => t === w || t.startsWith(w + "/"))
    }
    const have = n.source.fm[key]
    return Array.isArray(have) ? have.includes(want) : have === want
  })
}

/** URL of the MP3 of a note, next to its page: /Books/Dune → /Books/Dune.mp3. */
export const audioPath = (n: Note) => `${n.url}.mp3`

/** A note's MP3: the cache file holding it, or the bytes themselves when caching is off, so a build never holds every MP3 in memory. */
export type Audio = string | Buffer

export const audioBytes = (a: Audio): Buffer => (typeof a === "string" ? fs.readFileSync(a) : a)

export interface AudioCache {
  /** The file of a cached MP3, or undefined on a miss. */
  file(parts: string[]): string | undefined
  /** Stores an MP3; its file, or undefined when it could not be kept. */
  write(parts: string[], data: Buffer): string | undefined
}

const stableCache: AudioCache = {
  file: (parts) => stableCacheFile("tts", parts),
  write: (parts, data) => writeStableCache("tts", parts, data),
}

const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex")

/**
 * The MP3 of every selected note, by URL. The engine starts on the first
 * cache miss only. It failing to start or dying midway, or no usable voice,
 * throws TtsUnavailable, while a note that fails alone is left out with a warning.
 */
export async function buildAudioIndex(
  notes: Record<Lang, Note[]>,
  langs: Lang[],
  tts: TtsConfig,
  voice: string | undefined,
  cache: AudioCache = stableCache,
): Promise<Map<string, Audio>> {
  if (!voice) throw new TtsUnavailable("DATME_TTS_VOICE is not set")
  let sample: Buffer
  try {
    sample = fs.readFileSync(voice)
  } catch (e) {
    throw new TtsUnavailable(`cannot read DATME_TTS_VOICE (${(e as Error).message})`)
  }
  if (!sample.length) throw new TtsUnavailable(`DATME_TTS_VOICE ${voice} is empty`)
  const voiceHash = sha256(sample)
  const engineKey = engineId()
  const index = new Map<string, Audio>()
  let engine: Promise<TtsEngine> | undefined
  try {
    for (const lang of langs) {
      const model = ttsModel(lang, tts)
      if (!model) continue
      for (const n of notes[lang]) {
        // A page showing another language's text is not read by this language's model.
        if (n.isHome || n.contentLang !== lang || !ttsSelected(n, tts)) continue
        // These layouts have no Listen button.
        if (n.layout === "cv" || n.layout === "links") continue
        const chunks = noteChunks(n)
        // The first chunk is the title: a note with nothing else has nothing to read.
        if (chunks.length < 2) continue
        const key = [model, engineKey, voiceHash, sha256(JSON.stringify(chunks))]
        const cached = cache.file(key)
        if (cached) {
          index.set(n.url, cached)
          continue
        }
        const running = await (engine ??= startEngine(voice))
        let mp3: Buffer
        try {
          mp3 = await running.synthesize(model, voice, chunks)
        } catch (e) {
          // A dead engine fails every note after this one: the build stops rather than publish them silent.
          if (!running.alive) throw new TtsUnavailable(`the engine stopped at ${n.url} (${(e as Error).message})`)
          console.warn(`[datme] audio skipped for ${n.url}: ${(e as Error).message}`)
          continue
        }
        index.set(n.url, cache.write(key, mp3) ?? mp3)
      }
    }
  } finally {
    const running = await engine?.catch(() => undefined)
    await running?.close()
  }
  return index
}

/**
 * The audio of this build, made once per process (shared through globalThis, as
 * Astro loads its own copy of this module). None in `datme dev`, whatever NODE_ENV says,
 * nor with DATME_TTS=off, for a build without the toolchain or the voice sample.
 */
export function audioIndex(): Promise<Map<string, Audio>> {
  const g = globalThis as { __datmeAudioIndex?: Promise<Map<string, Audio>> }
  return (g.__datmeAudioIndex ??=
    process.env.DATME_DEV || process.env.DATME_TTS === "off" || !site.tts
      ? Promise.resolve(new Map())
      : buildAudioIndex(getVault().notes, site.langs, site.tts, process.env.DATME_TTS_VOICE))
}

export const hasAudio = async (n: Note): Promise<boolean> => (await audioIndex()).has(n.url)
