import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

describe("audio in a build", () => {
  const root = path.resolve(import.meta.dir, "..")
  const vault = path.join(root, "tests/fixtures/tts/vault")
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-tts-"))
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  const build = (out: string, extra: string[] = [], env: Record<string, string> = {}) =>
    Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out, ...extra], {
      cwd: root,
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: "1",
        DATME_VAULT: "",
        VAULT_PATH: "",
        DATME_CACHE: "",
        DATME_TTS_CMD: JSON.stringify(["bun", path.join(root, "tests/fixtures/tts/fake-engine.ts")]),
        DATME_TTS_VOICE: path.join(root, "tests/fixtures/tts/voice.wav"),
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    })

  test("selected notes are published as MP3, drafts only with --drafts", () => {
    const out = path.join(tmp, "site")
    const proc = build(out)
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
    expect(fs.readFileSync(path.join(out, "Podcast/Episode.mp3"), "utf8")).toContain("Xin chào")
    const page = fs.readFileSync(path.join(out, "Podcast/Episode/index.html"), "utf8")
    expect(page).toMatch(/<button[^>]*class="listen"[^>]*data-audio="\/Podcast\/Episode\.mp3"/)
    expect(fs.readFileSync(path.join(out, "Other/Plain/index.html"), "utf8")).not.toContain('class="listen"')
    expect(fs.existsSync(path.join(out, "en-US/Podcast/Episode.mp3"))).toBe(false)
    expect(fs.existsSync(path.join(out, "Other/Plain.mp3"))).toBe(false)
    expect(fs.existsSync(path.join(out, "Podcast/Draft.mp3"))).toBe(false)
    expect(proc.stdout.toString() + proc.stderr.toString()).toContain("[datme] audio skipped for /Podcast/Broken: boom")

    const drafts = path.join(tmp, "drafts")
    const withDrafts = build(drafts, ["--drafts"])
    if (withDrafts.exitCode !== 0) throw new Error(withDrafts.stderr.toString() || withDrafts.stdout.toString())
    expect(fs.readFileSync(path.join(drafts, "Podcast/Draft.mp3"), "utf8")).toContain("Bản nháp")
  }, 180_000)

  test("an engine that cannot start fails the build", () => {
    const proc = build(path.join(tmp, "broken"), [], { FAKE_TTS_NO_START: "1" })
    expect(proc.exitCode).not.toBe(0)
    expect(proc.stdout.toString() + proc.stderr.toString()).toContain("TtsUnavailable: Text-to-speech engine unavailable")
  }, 180_000)
})
