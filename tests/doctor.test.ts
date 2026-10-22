import { describe, expect, test } from "bun:test"
import { diagnose, formatDiagnosis, meets, type Machine } from "../src/lib/doctor"
import { site } from "../src/site.config"
import { parseArgs } from "../src/cli"

const machine = (over: Partial<Machine> = {}): Machine => ({
  env: { DATME_LOCK_TESTERS: "x", DATME_LOCK_NOBODY: "y" },
  runtime: { bun: "1.4.2", node: "24.3.0" },
  engines: { node: "^22.18.0 || >=23.6", bun: ">=1.2" },
  resolves: () => true,
  which: () => true,
  git: () => "git version 2.50.0",
  gitTop: () => "/repo",
  ...over,
})
const levels = (m: Machine) => diagnose(m).map((f) => `${f.level}: ${f.message}`)

describe("meets", () => {
  test("compares versions against >= ranges", () => {
    expect(meets("23.6.0", ">=23.6")).toBe(true)
    expect(meets("v25.2.1", ">=23.6")).toBe(true)
    expect(meets("23.5.9", ">=23.6")).toBe(false)
    expect(meets("1.1.30", ">=1.2")).toBe(false)
    expect(meets("1.0.0", undefined)).toBe(true)
  })

  test("takes alternatives and caret ranges, as the engines of package.json write them", () => {
    const node = "^22.18.0 || >=23.6"
    expect(meets("22.18.0", node)).toBe(true)
    expect(meets("v22.20.1", node)).toBe(true)
    expect(meets("22.17.9", node)).toBe(false)
    expect(meets("23.5.0", node)).toBe(false)
    expect(meets("24.1.0", node)).toBe(true)
    expect(meets("20.19.0", node)).toBe(false)
    // A form it does not know never stands in the way.
    expect(meets("1.0.0", "~1.2 || latest")).toBe(true)
  })
})

describe("datme doctor", () => {
  test("all good on a machine with everything", () => {
    const findings = diagnose(machine())
    expect(findings.every((f) => f.level === "ok")).toBe(true)
    expect(formatDiagnosis(findings)).toEndWith("All good.")
  })

  test("an old runtime is to fix, with the command that fixes it", () => {
    const [bun] = diagnose(machine({ runtime: { bun: "1.1.0", node: "22.0.0" } }))
    expect(bun).toEqual({ level: "fail", message: "Bun 1.1.0 is too old (needs >=1.2)", fix: "bun upgrade" })
    expect(levels(machine({ runtime: { node: "22.1.0" } }))[0]).toBe("fail: Node 22.1.0 is too old (needs ^22.18.0 || >=23.6)")
  })

  test("a group password used by a published note must be in the environment; its value is never shown", () => {
    const findings = diagnose(machine({ env: { DATME_LOCK_TESTERS: "tester-secret" } }))
    const nobody = findings.find((f) => f.message.startsWith("DATME_LOCK_NOBODY"))!
    expect(nobody.level).toBe("fail")
    expect(nobody.fix).toContain("export DATME_LOCK_NOBODY=")
    expect(JSON.stringify(findings)).not.toContain("tester-secret")
    expect(findings.find((f) => f.message.startsWith("DATME_LOCK_TESTERS"))?.level).toBe("ok")
  })

  test("an optional package the vault needs and cannot find is to fix", () => {
    const before = site.related.semantic
    site.related.semantic = { model: "m", threshold: 0.5 }
    try {
      const missing = diagnose(machine({ resolves: (p) => p !== "@huggingface/transformers" })).find((f) => f.message.includes("transformers"))!
      expect(missing).toMatchObject({ level: "fail", fix: "bun add @huggingface/transformers   (next to datme)" })
    } finally {
      site.related.semantic = before
    }
  })

  test("tts needs uv and a voice clip, each with its fix; without tts there is nothing to check", () => {
    const before = site.tts
    try {
      site.tts = undefined
      expect(diagnose(machine({ which: () => false })).some((f) => /uv|DATME_TTS_VOICE/.test(f.message))).toBe(false)
      site.tts = { models: { vi: "vieneu" }, folders: ["a"], frontmatter: {} }
      const good = diagnose(machine({ env: { DATME_LOCK_TESTERS: "x", DATME_LOCK_NOBODY: "y", DATME_TTS_VOICE: "/clip.wav" } }))
      expect(good.filter((f) => /uv|DATME_TTS_VOICE/.test(f.message)).map((f) => f.level)).toEqual(["ok", "ok"])
      const bad = diagnose(machine({ which: () => false }))
      expect(bad.find((f) => f.message.startsWith("uv is not installed"))).toMatchObject({ level: "fail", fix: expect.stringContaining("astral.sh/uv") })
      const voice = bad.find((f) => f.message.startsWith("DATME_TTS_VOICE is not set"))!
      expect(voice.level).toBe("fail")
      expect(voice.fix).toContain("3-8 s")
      expect(voice.fix).toContain("outside the vault")
      // DATME_TTS=off builds without audio: neither uv nor the clip is needed.
      const off = diagnose(machine({ which: () => false, env: { DATME_LOCK_TESTERS: "x", DATME_LOCK_NOBODY: "y", DATME_TTS: "off" } }))
      expect(off.filter((f) => /uv|DATME_TTS/.test(f.message)).map((f) => [f.level, f.message])).toEqual([["ok", "tts is off (DATME_TTS=off): builds publish no audio"]])
    } finally {
      site.tts = before
    }
  })

  test("without git, or outside a repository, dates come from the file system", () => {
    expect(levels(machine({ git: () => undefined }))).toContain("warn: git is not installed: dates come from the file system")
    expect(levels(machine({ gitTop: () => undefined })).some((l) => l.startsWith("warn: the vault is not in a git repository"))).toBe(true)
  })

  test("a missing site.url is to look at", () => {
    const before = site.url
    site.url = undefined
    try {
      const findings = diagnose(machine())
      expect(findings.at(-1)?.level).toBe("warn")
      expect(formatDiagnosis(findings)).toEndWith("0 to fix, 1 to look at")
    } finally {
      site.url = before
    }
  })

  test("is a command of its own", () => {
    expect(parseArgs(["doctor", "~/Notes"])).toMatchObject({ command: "doctor", vault: "~/Notes" })
  })
})
