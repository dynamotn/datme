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

  test("subscriptions are off unless a provider is set, and checked when it is", () => {
    expect(c.subscribe).toBeUndefined()
    expect(resolveConfig({ subscribe: { provider: "form", action: "https://x.example/s" } }, "/v").subscribe).toEqual({
      provider: "form",
      action: "https://x.example/s",
      field: "email",
    })
    expect(() => resolveConfig({ subscribe: { provider: "buttondown", username: "a b" } }, "/v")).toThrow()
  })

  test("the footer credits datme unless told not to", () => {
    expect(c.poweredBy).toBe(true)
    expect(resolveConfig({ poweredBy: false }, "/v").poweredBy).toBe(false)
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

  test("webmentions use the host of the site unless an account is given", () => {
    expect(resolveConfig({ site: { url: "https://notes.example" }, webmentions: {} }, "/v").webmentions).toEqual({
      domain: "notes.example",
    })
    expect(resolveConfig({ webmentions: { domain: "me.example" } }, "/v").webmentions).toEqual({ domain: "me.example" })
    expect(resolveConfig({}, "/v").webmentions).toBeUndefined()
    expect(() => resolveConfig({ webmentions: {} }, "/v")).toThrow("needs site.url or webmentions.domain")
  })

  test("rel=me profiles must be URLs and the fediverse handle must look like one", () => {
    expect(resolveConfig({}, "/v").me).toEqual([])
    expect(() => resolveConfig({ site: { me: ["mastodon"] } }, "/v")).toThrow("site.me.0")
    expect(() => resolveConfig({ site: { fediverse: "me@host" } }, "/v")).toThrow("expected @user@host")
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
    expect(c.conventions).toEqual({
      typePrefix: "type/",
      blogTags: ["type/blog", "blog"],
      mapTags: ["type/moc", "moc"],
      flashcardTags: ["flashcards"],
      timelineTags: ["timeline", "type/event"],
    })
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

  test("the archive is a built-in menu entry", () => {
    expect(resolveConfig({ nav: ["archive"] }, "/v").nav).toEqual([{ kind: "archive" }])
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
    expect(c.stackedPages).toBe(true)
    expect(c.lineBreaks).toEqual({ all: false, types: [], folders: [] })
    expect(c.related).toEqual({ count: 5, mentions: true, semantic: false })
    expect(resolveConfig({ related: { semantic: true } }, "/v").related.semantic).toEqual({
      model: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
      threshold: 0.55,
    })
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

describe("note types", () => {
  test("common types have icons and are labelled by their name", () => {
    const c = resolveConfig({ languages: ["vi-VN"] }, "/v")
    expect(c.types.book).toEqual({ icon: "📕", label: { "vi-VN": "book" } })
  })

  test("the config overrides icons, adds labels and new types", () => {
    const c = resolveConfig({ types: { book: { icon: "📚", label: "Sách" }, recipe: { icon: "🍲" } } }, "/v")
    expect(c.types.book).toEqual({ icon: "📚", label: { "en-US": "Sách" } })
    expect(c.types.recipe.icon).toBe("🍲")
  })
})

describe("theme", () => {
  test("defaults to datme's own look with an optional datme.css", () => {
    expect(resolveConfig({}, "/v").theme).toEqual({
      fonts: {},
      css: "datme.css",
      code: { light: "github-light", dark: "github-dark" },
      comments: { light: "light", dark: "dark" },
      mermaid: { light: "neutral", dark: "dark" },
      d2: { light: 0, dark: 200 },
    })
  })

  test("tools take a theme per colour scheme, or one for both, checked against what they know", () => {
    const theme = resolveConfig({ theme: { code: "dracula", comments: { light: "noborder_light", dark: "https://example.com/g.css" }, mermaid: "forest", d2: { light: 1, dark: 201 } } }, "/v").theme
    expect(theme.code).toEqual({ light: "dracula", dark: "dracula" })
    expect(theme.comments).toEqual({ light: "noborder_light", dark: "https://example.com/g.css" })
    expect(theme.mermaid).toEqual({ light: "forest", dark: "forest" })
    expect(theme.d2).toEqual({ light: 1, dark: 201 })
    expect(() => resolveConfig({ theme: { code: "nope" } }, "/v")).toThrow("expected a Shiki theme")
    expect(() => resolveConfig({ theme: { comments: "x\" onload=\"y" } }, "/v")).toThrow("expected a giscus theme")
    expect(() => resolveConfig({ theme: { mermaid: "pink" } }, "/v")).toThrow()
    expect(() => resolveConfig({ theme: { code: { light: "github-light" } } }, "/v")).toThrow()
  })

  test("accents and font names are checked so they cannot break out of CSS", () => {
    expect(() => resolveConfig({ theme: { accent: "red;}body{display:none" } }, "/v")).toThrow("expected a CSS colour")
    expect(() => resolveConfig({ theme: { fonts: { body: "x}<style>" } } }, "/v")).toThrow("expected a font family name")
    expect(resolveConfig({ theme: { accent: "oklch(0.6 0.2 260)" } }, "/v").theme.accent).toBe("oklch(0.6 0.2 260)")
  })
})
