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

describe("logo", () => {
  test("defaults to the first letter of the title, skipping emoji", () => {
    expect(resolveConfig({ site: { title: "🪴 digital garden" } }, "/v").logo).toBe("D")
    expect(resolveConfig({}, "/home/me/notes").logo).toBe("N")
  })

  test("can be set explicitly", () => {
    expect(resolveConfig({ site: { logo: "đ" } }, "/v").logo).toBe("đ")
  })
})

describe("menu and appearance", () => {
  test("the menu defaults to home and tags, in the notebook style", () => {
    const c = resolveConfig({}, "/v")
    expect(c.nav).toEqual([{ kind: "home" }, { kind: "tags" }])
    expect(c.appearance).toEqual({ style: "notebook", classic: [] })
  })

  test("menu entries can be notes or URLs, with localised labels", () => {
    const c = resolveConfig(
      {
        languages: ["vi-VN", "en-US"],
        nav: [{ note: "About me", label: { "vi-VN": "Về tôi", "en-US": "About" } }, { url: "/cv.pdf", label: "CV" }],
        appearance: { classic: ["/Writing/"] },
      },
      "/v",
    )
    expect(c.nav[0]).toEqual({ kind: "note", target: "About me", label: { "vi-VN": "Về tôi", "en-US": "About" } })
    expect(c.nav[1]).toEqual({ kind: "url", target: "/cv.pdf", label: { "vi-VN": "CV", "en-US": "CV" } })
    expect(c.appearance.classic).toEqual(["Writing"])
  })

  test("URL entries need a label and styles are checked", () => {
    expect(() => resolveConfig({ nav: [{ url: "/x" }] }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ appearance: { style: "neon" } }, "/v")).toThrow(ConfigError)
  })
})

describe("analytics, comments and CNAME", () => {
  test("all are off by default", () => {
    const c = resolveConfig({}, "/v")
    expect(c.analytics).toBeUndefined()
    expect(c.comments).toBeUndefined()
    expect(c.cname).toBe(false)
    expect(c.ogImages).toBe(true)
  })

  test("each provider checks its own fields", () => {
    expect(resolveConfig({ analytics: { provider: "plausible" } }, "/v").analytics).toEqual({ provider: "plausible" })
    expect(() => resolveConfig({ analytics: { provider: "google" } }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ analytics: { provider: "matomo", id: "1" } }, "/v")).toThrow(ConfigError)
    expect(() =>
      resolveConfig({ comments: { provider: "giscus", repo: "nope", repoId: "a", category: "b", categoryId: "c" } }, "/v"),
    ).toThrow("expected owner/name")
  })

  test("giscus maps by pathname and commento uses the hosted service unless told otherwise", () => {
    const g = resolveConfig(
      { comments: { provider: "giscus", repo: "a/b", repoId: "r", category: "c", categoryId: "i" } },
      "/v",
    ).comments
    expect(g).toMatchObject({ mapping: "pathname", reactions: true })
    expect(resolveConfig({ comments: { provider: "commento" } }, "/v").comments).toEqual({
      provider: "commento",
      host: "https://cdn.commento.io",
    })
  })
})
