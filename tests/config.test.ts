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

  test("a --site URL without its scheme is a config error, not a crash later on", () => {
    expect(() => resolveConfig({}, "/v", { DATME_SITE_URL: "notes.example.com" })).toThrow(ConfigError)
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

  test("only the three Zettelkasten kinds are presets; any other stage is the vault's own", () => {
    const c = resolveConfig(
      {
        languages: ["en-US"],
        stages: { Inbox: "Fleeting", Sources: "literature", Notes: "permanent", "03_Atomic": "atomic", Maps: "Maps of content", "06_Lab": { icon: "🧪" }, Bare: null },
      },
      "/v",
    )
    expect(Object.fromEntries(Object.entries(c.stages).map(([k, v]) => [k, `${v.icon} ${v.label["en-US"]}`]))).toEqual({
      Inbox: "🌱 Fleeting",
      Sources: "📖 Literature",
      Notes: "🌳 Permanent",
      // What used to be a preset is now a label of its own.
      "03_Atomic": "🗂️ atomic",
      Maps: "🗂️ Maps of content",
      // Without a label, the folder's name without its number.
      "06_Lab": "🧪 Lab",
      Bare: "🗂️ Bare",
    })
    expect(Object.values(c.stages).map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test("a stage must be a name or an icon and a label", () => {
    expect(() => resolveConfig({ stages: { X: "" } }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ stages: { X: { colour: "red" } } }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ stages: { X: 3 } }, "/v")).toThrow(ConfigError)
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
      ratingScale: 5,
    })
  })

  test("ratings can use another scale, within 2 to 10 stars", () => {
    expect(resolveConfig({ conventions: { ratingScale: 7 } }, "/v").conventions.ratingScale).toBe(7)
    expect(() => resolveConfig({ conventions: { ratingScale: 1 } }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ conventions: { ratingScale: 4.5 } }, "/v")).toThrow(ConfigError)
  })

  test("conventions can be partially overridden", () => {
    const c = resolveConfig({ home: "/Home.md", conventions: { blogTags: ["post"] } }, "/v")
    expect(c.home).toBe("Home.md")
    expect(c.conventions.blogTags).toEqual(["post"])
    expect(c.conventions.typePrefix).toBe("type/")
  })

  test("a bento home: the short form keeps index.md, the long one picks its note and tiles", () => {
    expect(resolveConfig({}, "/v").bento).toBeUndefined()
    const short = resolveConfig({ home: "bento" }, "/v")
    expect(short.home).toBe("index.md")
    expect(short.bento).toEqual({ tiles: ["now", "recent", "random", "stats", "graph", "stream", "tags"] })
    const long = resolveConfig({ home: { note: "/Start.md", layout: "bento", tiles: ["stats", "now", "stats"] } }, "/v")
    expect(long.home).toBe("Start.md")
    expect(long.bento).toEqual({ tiles: ["stats", "now"] })
    const plain = resolveConfig({ home: { note: "Start.md" } }, "/v")
    expect(plain.home).toBe("Start.md")
    expect(plain.bento).toBeUndefined()
    expect(() => resolveConfig({ home: { layout: "bento", tiles: ["weather"] } }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ home: { layout: "bento", tiles: [] } }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ home: { layout: "grid" } }, "/v")).toThrow(ConfigError)
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
    expect(c.appearance).toEqual({ style: "notebook", classic: [], folders: {}, tags: {}, stream: [], seasons: false, readerSwitch: [] })
  })

  test("the garden style and a style per folder", () => {
    const c = resolveConfig({ appearance: { style: "garden", folders: { "/Writing/": "classic", "Lab/Old": "notebook" } } }, "/v")
    expect(c.appearance.style).toBe("garden")
    expect(c.appearance.folders).toEqual({ Writing: "classic", "Lab/Old": "notebook" })
  })

  test("the garden can follow the seasons of either hemisphere", () => {
    const seasons = (v: unknown) => resolveConfig({ appearance: { seasons: v } }, "/v").appearance.seasons
    expect(seasons(true)).toEqual({ hemisphere: "north" })
    expect(seasons(false)).toBe(false)
    expect(seasons({})).toEqual({ hemisphere: "north" })
    expect(seasons({ hemisphere: "south" })).toEqual({ hemisphere: "south" })
    expect(() => seasons({ hemisphere: "east" })).toThrow()
  })

  test("the herbarium, manuscript and lacquer styles", () => {
    for (const style of ["herbarium", "manuscript", "lacquer"] as const) expect(resolveConfig({ appearance: { style } }, "/v").appearance.style).toBe(style)
  })
  test("the zine, atlas and catalog styles", () => {
    for (const style of ["zine", "atlas", "catalog"] as const) expect(resolveConfig({ appearance: { style } }, "/v").appearance.style).toBe(style)
  })

  test("a style per tag, written as in a note's tags", () => {
    const c = resolveConfig({ appearance: { tags: { "#Poem": "classic", "type/TIL": "garden", "#": "garden" } } }, "/v")
    expect(c.appearance.tags).toEqual({ Poem: "classic", "type/TIL": "garden" })
    expect(() => resolveConfig({ appearance: { tags: { poem: "fancy" } } }, "/v")).toThrow()
  })

  test("unknown styles are rejected", () => {
    expect(() => resolveConfig({ appearance: { style: "library" } }, "/v")).toThrow()
    expect(() => resolveConfig({ appearance: { folders: { A: "fancy" } } }, "/v")).toThrow()
  })

  test("menu entries can be notes or URLs, with localised labels", () => {
    const c = resolveConfig(
      {
        languages: ["vi-VN", "en-US"],
        nav: [{ note: "About me", label: { "vi-VN": "Về tôi", "en-US": "About" } }, { url: "/cv.pdf", label: "CV" }],
        appearance: { classic: ["/Writing/"], stream: ["Notes/"] },
      },
      "/v",
    )
    expect(c.nav[0]).toEqual({ kind: "note", target: "About me", label: { "vi-VN": "Về tôi", "en-US": "About" } })
    expect(c.nav[1]).toEqual({ kind: "url", target: "/cv.pdf", label: { "vi-VN": "CV", "en-US": "CV" } })
    expect(c.appearance.classic).toEqual(["Writing"])
    expect(c.appearance.stream).toEqual(["Notes"])
  })

  test("sidebar shortcuts take the same entries as the menu, and there are none by default", () => {
    expect(resolveConfig({}, "/v").sidebar).toEqual([])
    const c = resolveConfig({ sidebar: ["tags", { note: "Now" }, { url: "https://example.com", label: "Example" }] }, "/v")
    expect(c.sidebar).toEqual([
      { kind: "tags" },
      { kind: "note", target: "Now", label: undefined },
      { kind: "url", target: "https://example.com", label: { "en-US": "Example" } },
    ])
    expect(() => resolveConfig({ sidebar: [{ url: "/x" }] }, "/v")).toThrow(ConfigError)
  })

  test("footer columns: headings to menu entries, and single links in a first column without one", () => {
    expect(resolveConfig({}, "/v").footer).toEqual([])
    // The older flat form still works: one column, no heading.
    expect(resolveConfig({ footer: { GitHub: "https://github.com/me" } }, "/v").footer).toEqual([
      { items: [{ kind: "url", target: "https://github.com/me", label: { "en-US": "GitHub" } }] },
    ])
    const c = resolveConfig(
      { footer: { Explore: ["home", { note: "About me", label: "About" }], npm: "https://npmjs.com/x", Empty: [], Elsewhere: [{ url: "/index.xml", label: "RSS" }] } },
      "/v",
    )
    expect(c.footer).toEqual([
      { items: [{ kind: "url", target: "https://npmjs.com/x", label: { "en-US": "npm" } }] },
      { title: "Explore", items: [{ kind: "home" }, { kind: "note", target: "About me", label: { "en-US": "About" } }] },
      { title: "Elsewhere", items: [{ kind: "url", target: "/index.xml", label: { "en-US": "RSS" } }] },
    ])
    expect(() => resolveConfig({ footer: { Explore: [{ url: "/x" }] } }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ footer: { GitHub: "" } }, "/v")).toThrow(ConfigError)
  })

  test("the archive and the practice page are built-in menu entries", () => {
    expect(resolveConfig({ nav: ["archive"] }, "/v").nav).toEqual([{ kind: "archive" }])
    expect(resolveConfig({ nav: ["practice"] }, "/v").nav).toEqual([{ kind: "practice" }])
  })

  test("URL entries need a label and styles are checked", () => {
    expect(() => resolveConfig({ nav: [{ url: "/x" }] }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ appearance: { style: "neon" } }, "/v")).toThrow(ConfigError)
  })
})

describe("reader tools", () => {
  test("notes offer ChatGPT and Claude and never say they are outdated, by default", () => {
    const c = resolveConfig({}, "/v")
    expect(c.askAi).toEqual(["chatgpt", "claude"])
    expect(c.outdated).toBeUndefined()
  })

  test("stats show every health indicator unless hidden", () => {
    expect(resolveConfig({}, "/v").stats).toEqual({ hide: [] })
    expect(resolveConfig({ stats: { hide: ["hubs"] } }, "/v").stats.hide).toEqual(["hubs"])
    expect(() => resolveConfig({ stats: { hide: ["mood"] } }, "/v")).toThrow(ConfigError)
  })

  test("assistants and the age of outdated notes are checked", () => {
    expect(resolveConfig({ askAi: [] }, "/v").askAi).toEqual([])
    expect(resolveConfig({ outdated: { after: 1.5 } }, "/v").outdated).toEqual({ after: 1.5 })
    expect(() => resolveConfig({ askAi: ["gemini"] }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ outdated: { after: 0 } }, "/v")).toThrow(ConfigError)
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
    expect(c.graph).toEqual({ depth: 1, view: "2d" })
    expect(resolveConfig({ graph: { depth: 2 } }, "/v").graph.depth).toBe(2)
    expect(() => resolveConfig({ graph: { depth: 3 } }, "/v")).toThrow(ConfigError)
    expect(resolveConfig({ graph: { view: "3d" } }, "/v").graph).toEqual({ depth: 1, view: "3d" })
    expect(() => resolveConfig({ graph: { view: "4d" } }, "/v")).toThrow(ConfigError)
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
      scheme: "auto",
      fonts: {},
      css: "datme.css",
      code: { light: "github-light", dark: "github-dark" },
      comments: { light: "light", dark: "dark" },
      mermaid: { light: "neutral", dark: "dark" },
      d2: { light: 0, dark: 200 },
    })
  })

  test("the colour scheme readers start in is auto, light or dark", () => {
    expect(resolveConfig({ theme: { scheme: "dark" } }, "/v").theme.scheme).toBe("dark")
    expect(() => resolveConfig({ theme: { scheme: "sepia" } }, "/v")).toThrow()
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

describe("tts", () => {
  const vault = "/home/me/My Notes"
  const msg = (raw: unknown) => {
    try {
      resolveConfig(raw, vault)
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError)
      return (e as Error).message
    }
    throw new Error("expected resolveConfig to throw")
  }

  test("is off unless configured", () => {
    expect(resolveConfig({}, vault).tts).toBeUndefined()
  })

  test("fills the selection defaults", () => {
    const raw = { languages: ["vi-VN"], tts: { models: { vi: "vieneu" }, folders: ["Podcast"] } }
    expect(resolveConfig(raw, vault).tts).toEqual({ models: { vi: "vieneu" }, folders: ["Podcast"], frontmatter: {} })
  })

  test("accepts a model key equal to a language or to its base language", () => {
    const tts = { models: { "vi-VN": "vieneu" }, frontmatter: { audio: true } }
    expect(resolveConfig({ languages: ["vi-VN"], tts }, vault).tts?.models).toEqual({ "vi-VN": "vieneu" })
  })

  test("rejects a model other than vieneu", () => {
    expect(msg({ languages: ["vi-VN"], tts: { models: { vi: "xtts" }, folders: ["a"] } })).toContain("tts.models.vi")
  })

  test("rejects a model key matching no language", () => {
    const raw = { languages: ["vi-VN"], tts: { models: { fr: "vieneu" }, folders: ["a"] } }
    expect(msg(raw)).toContain("tts.models.fr")
  })

  test("rejects a config that selects no notes", () => {
    const raw = { languages: ["vi-VN"], tts: { models: { vi: "vieneu" } } }
    expect(msg(raw)).toContain("tts: selects no notes")
  })

  test("strips the slashes around folders, as Obsidian paths have none", () => {
    const raw = { languages: ["vi-VN"], tts: { models: { vi: "vieneu" }, folders: ["Podcast/", "/Books/Audio/"] } }
    expect(resolveConfig(raw, vault).tts?.folders).toEqual(["Podcast", "Books/Audio"])
  })

  test("rejects an empty folder", () => {
    for (const folder of ["", "/"]) {
      expect(msg({ languages: ["vi-VN"], tts: { models: { vi: "vieneu" }, folders: ["Podcast", folder] } })).toContain("tts.folders")
    }
  })

  test("rejects an unknown key such as voice", () => {
    expect(() => resolveConfig({ languages: ["vi-VN"], tts: { models: { vi: "vieneu" }, folders: ["a"], voice: "x.wav" } }, vault)).toThrow()
  })
})
