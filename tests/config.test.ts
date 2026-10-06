import { describe, expect, test } from "bun:test"
import path from "node:path"
import { resolveConfig, loadConfig, vaultFromEnv, ConfigError } from "../src/site.config"

const fixture = path.resolve(import.meta.dir, "fixtures/vault")

describe("defaults", () => {
  const c = resolveConfig(undefined, "/home/me/My Notes")

  test("a vault without config is an English site named after its folder", () => {
    expect(c.langs).toEqual(["en-US"])
    expect(c.defaultLang).toBe("en-US")
    expect(c.title).toEqual({ "en-US": "My Notes" })
    expect(c.url).toBeUndefined()
    expect(c.stages).toEqual({})
  })

  test("common private folders are always ignored", () => {
    expect(c.ignore).toEqual(expect.arrayContaining([".obsidian", ".trash", "templates", "private"]))
  })
})

describe("resolveConfig", () => {
  test("localised values fall back to the same base language, then to the first one", () => {
    const c = resolveConfig(
      { site: { title: { "en-GB": "Garden", "vi-VN": "Vườn" } }, languages: ["en-US", "vi-VN", "fr-FR"] },
      "/v",
    )
    expect(c.title).toEqual({ "en-US": "Garden", "vi-VN": "Vườn", "fr-FR": "Garden" })
  })

  test("stages accept presets and custom definitions, in config order", () => {
    const c = resolveConfig(
      { languages: ["vi-VN"], stages: { "10_Inbox": "fleeting", Lab: { icon: "🧪", label: "Lab" } } },
      "/v",
    )
    expect(c.stages["10_Inbox"]).toEqual({ icon: "🌱", label: { "vi-VN": "Thoáng qua" }, order: 0 })
    expect(c.stages.Lab).toEqual({ icon: "🧪", label: { "vi-VN": "Lab" }, order: 1 })
  })

  test("ignore entries are normalised and merged with the defaults", () => {
    const c = resolveConfig({ ignore: ["/Archive/", ".obsidian"] }, "/v")
    expect(c.ignore.filter((x) => x === ".obsidian")).toHaveLength(1)
    expect(c.ignore).toContain("Archive")
  })

  test("DATME_SITE_URL overrides the configured URL, without a trailing slash", () => {
    const c = resolveConfig({ site: { url: "https://a.example" } }, "/v", { DATME_SITE_URL: "https://b.example/" })
    expect(c.url).toBe("https://b.example")
  })

  test("invalid configs fail with the path of every problem", () => {
    expect(() => resolveConfig({ languages: [], site: { url: "not a url" }, typo: 1 }, "/v")).toThrow(ConfigError)
    try {
      resolveConfig({ languages: [], site: { url: "not a url" } }, "/v")
    } catch (e) {
      expect((e as Error).message).toContain("languages")
      expect((e as Error).message).toContain("site.url")
    }
  })

  test("unknown stage presets are rejected", () => {
    expect(() => resolveConfig({ stages: { X: "sprouting" } }, "/v")).toThrow(ConfigError)
  })
})

describe("loading", () => {
  test("datme.yaml at the vault root is read", () => {
    const c = loadConfig(fixture, {})
    expect(c.langs).toEqual(["vi-VN", "en-US"])
    expect(c.title["en-US"]).toBe("Test garden")
    expect(c.tagline["vi-VN"]).toBe("A test notebook")
    expect(c.stages["07_Project"].label["en-US"]).toBe("Experiments")
  })

  test("the vault comes from DATME_VAULT, then VAULT_PATH, with ~ expanded", () => {
    expect(vaultFromEnv({ DATME_VAULT: "/a", VAULT_PATH: "/b" })).toBe("/a")
    expect(vaultFromEnv({ VAULT_PATH: "/b" })).toBe("/b")
    expect(vaultFromEnv({ DATME_VAULT: "~/x" })).toMatch(/\/x$/)
    expect(vaultFromEnv({ DATME_VAULT: "~/x" }).startsWith("~")).toBe(false)
  })
})

describe("publishing rules and conventions", () => {
  test("defaults are explicit publishing, index.md as home and type/ tags", () => {
    const c = resolveConfig({}, "/v")
    expect(c.publish).toBe("explicit")
    expect(c.home).toBe("index.md")
    expect(c.conventions).toEqual({ typePrefix: "type/", blogTags: ["type/blog", "blog"], mapTags: ["type/moc", "moc"] })
  })

  test("conventions can be partially overridden", () => {
    const c = resolveConfig({ home: "/Home.md", conventions: { blogTags: ["post"] } }, "/v")
    expect(c.home).toBe("Home.md")
    expect(c.conventions.blogTags).toEqual(["post"])
    expect(c.conventions.typePrefix).toBe("type/")
  })

  test("unknown publish modes are rejected", () => {
    expect(() => resolveConfig({ publish: "some" }, "/v")).toThrow(ConfigError)
  })
})
