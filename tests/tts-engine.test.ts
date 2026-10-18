import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { defaultCommand, startEngine, TtsUnavailable, VIENEU_VERSION, type TtsEngine } from "../src/lib/tts-engine"

const FAKE = JSON.stringify(["bun", "tests/fixtures/tts/fake-engine.ts"])
let engine: TtsEngine | undefined

beforeEach(() => {
  process.env.DATME_TTS_CMD = FAKE
})

afterEach(async () => {
  delete process.env.DATME_TTS_CMD
  delete process.env.FAKE_TTS_NO_START
  delete process.env.FAKE_TTS_NOISE
  await engine?.close()
  engine = undefined
})

describe("tts engine", () => {
  test("exposes the pinned VieNeu version", () => {
    expect(VIENEU_VERSION).toBe("3.7.1")
  })

  test("the default command runs the pinned helper through uv", () => {
    const cmd = defaultCommand()
    expect(cmd.slice(0, 6)).toEqual(["uv", "run", "--quiet", "--with", `vieneu==${VIENEU_VERSION}`, "--with"])
    expect(cmd.at(-1)).toMatch(/tts[\\/]vieneu\.py$/)
    expect(existsSync(cmd.at(-1)!)).toBe(true)
  })

  test("the default script is the package's, whatever the cwd", () => {
    const cwd = process.cwd()
    const tmp = mkdtempSync(path.join(tmpdir(), "datme-decoy-"))
    mkdirSync(path.join(tmp, "src/lib/tts"), { recursive: true })
    writeFileSync(path.join(tmp, "src/lib/tts/vieneu.py"), "")
    try {
      process.chdir(tmp)
      const script = defaultCommand().at(-1)!
      expect(script.startsWith(realpathSync(tmp))).toBe(false)
      expect(script.startsWith(tmp)).toBe(false)
      expect(existsSync(script)).toBe(true)
    } finally {
      process.chdir(cwd)
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  test("synthesize returns the helper's mp3 bytes", async () => {
    engine = await startEngine()
    const mp3 = await engine.synthesize("vieneu", "/v.wav", ["a", "b"])
    expect(mp3.toString()).toBe("MP3:a|b")
  })

  test("answers concurrent requests in order", async () => {
    engine = await startEngine()
    const out = await Promise.all(["x", "y", "z"].map((c) => engine!.synthesize("vieneu", "/v.wav", [c])))
    expect(out.map(String)).toEqual(["MP3:x", "MP3:y", "MP3:z"])
  })

  test("an error reply rejects that call only", async () => {
    engine = await startEngine()
    await expect(engine.synthesize("vieneu", "/v.wav", ["FAIL"])).rejects.toThrow("boom")
    expect((await engine.synthesize("vieneu", "/v.wav", ["ok"])).toString()).toBe("MP3:ok")
  })

  test("a helper that exits before ready is unavailable", async () => {
    process.env.FAKE_TTS_NO_START = "1"
    await expect(startEngine()).rejects.toBeInstanceOf(TtsUnavailable)
  })

  test("a missing command is unavailable", async () => {
    process.env.DATME_TTS_CMD = JSON.stringify(["datme-no-such-command-xyz"])
    await expect(startEngine()).rejects.toBeInstanceOf(TtsUnavailable)
  })

  test("non-JSON stdout lines are ignored", async () => {
    process.env.FAKE_TTS_NOISE = "1"
    engine = await startEngine()
    expect((await engine.synthesize("vieneu", "/v.wav", ["a"])).toString()).toBe("MP3:a")
    expect((await engine.synthesize("vieneu", "/v.wav", ["b"])).toString()).toBe("MP3:b")
  })

  test("a reply written just before exit still resolves", async () => {
    engine = await startEngine()
    expect((await engine.synthesize("vieneu", "/v.wav", ["LAST"])).toString()).toBe("MP3:LAST")
    await expect(engine.synthesize("vieneu", "/v.wav", ["a"])).rejects.toThrow("exited")
  }, 5000)

  test("a crash rejects pending and later calls without hanging", async () => {
    engine = await startEngine()
    const pending = engine.synthesize("vieneu", "/v.wav", ["CRASH"])
    await expect(pending).rejects.toThrow("exited")
    await expect(engine.synthesize("vieneu", "/v.wav", ["a"])).rejects.toThrow("exited")
  }, 5000)

  test("close ends the process and is repeatable", async () => {
    engine = await startEngine()
    await engine.close()
    await engine.close()
    await expect(engine.synthesize("vieneu", "/v.wav", ["a"])).rejects.toThrow("exited")
  }, 5000)
})
