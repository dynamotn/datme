import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveConfig, loadConfig, vaultFromEnv, ConfigError, CONFIG_FILES, STYLES, SEMANTIC_MODEL } from "../src/site.config"

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-cov-config-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe("resolveConfig, the rest of the options", () => {
  test("settings that need site.url, or another setting, say which", () => {
    expect(() => resolveConfig({ activitypub: "bridgy" }, "/v")).toThrow("activitypub: needs site.url")
    expect(() => resolveConfig({ search: { meaning: true } }, "/v")).toThrow("search.meaning: needs related.semantic")
    const ok = resolveConfig(
      { site: { url: "https://g.example" }, activitypub: { username: "me" }, search: { meaning: true }, related: { semantic: { threshold: 0.7 } } },
      "/v",
    )
    expect(ok.activitypub).toEqual({ username: "me" })
    expect(ok.related.semantic).toEqual({ model: SEMANTIC_MODEL, threshold: 0.7 })
    expect(ok.search).toEqual({ engine: "minisearch", meaning: true })
  })

  test("paths and lists are normalised", () => {
    const c = resolveConfig(
      {
        neighbours: { friend: "https://friend.example//" },
        bibliography: "/refs.bib",
        images: { widths: [960, 480, 960, 200] },
        lineBreaks: { folders: ["/Poems/"] },
        theme: { css: "/styles/site.css" },
        askAi: ["claude", "claude"],
        languages: ["en-US", "en-US"],
      },
      "/v",
      { DATME_IGNORE: "/dist/", DATME_DRAFTS: "1" },
    )
    expect(c.neighbours).toEqual({ friend: "https://friend.example" })
    expect(c.bibliography).toEqual(["refs.bib"])
    expect(c.images.widths).toEqual([200, 480, 960])
    expect(c.lineBreaks.folders).toEqual(["Poems"])
    expect(c.theme.css).toBe("styles/site.css")
    expect(c.askAi).toEqual(["claude"])
    expect(c.langs).toEqual(["en-US"])
    expect(c.ignore).toContain("dist")
    expect(c.drafts).toBe(true)
    expect(resolveConfig({ bibliography: ["a.bib", "/b.bib"] }, "/v").bibliography).toEqual(["a.bib", "b.bib"])
    expect(resolveConfig({}, "/v").bibliography).toEqual([])
    expect(resolveConfig({}, "/v").drafts).toBe(false)
  })

  test("a title of only symbols falls back to a star logo, and the root folder to Notes", () => {
    expect(resolveConfig({ site: { title: "🌱 ☘" } }, "/v").logo).toBe("✦")
    expect(resolveConfig({}, "/").title["en-US"]).toBe("Notes")
  })

  test("tool themes take one name for both schemes, checked against Shiki's", () => {
    expect(resolveConfig({ theme: { code: "dracula" } }, "/v").theme.code).toEqual({ light: "dracula", dark: "dracula" })
    expect(() => resolveConfig({ theme: { code: "no-such-theme" } }, "/v")).toThrow("expected a Shiki theme")
  })

  test("a localised value falls back to the same base language", () => {
    expect(resolveConfig({ languages: ["en-US"], site: { title: { "en-GB": "Garden" } } }, "/v").title).toEqual({ "en-US": "Garden" })
  })

  test("a localised value with no entries falls back to the default", () => {
    expect(resolveConfig({ site: { tagline: {} } }, "/v").tagline).toEqual({ "en-US": "" })
  })

  test("a note in the menu without a label keeps it undefined", () => {
    expect(resolveConfig({ nav: [{ note: "About" }] }, "/v").nav).toEqual([{ kind: "note", target: "About", label: undefined }])
  })

  test("a root-level problem is named as (root)", () => {
    expect(() => resolveConfig("just text", "/v")).toThrow("(root)")
  })

  test("exports the styles and config names the CLI and docs use", () => {
    expect(STYLES).toContain("notebook")
    expect(CONFIG_FILES.length).toBeGreaterThan(0)
  })
})

describe("loadConfig", () => {
  test("a vault without a config gets the defaults, named after its folder", () => {
    const dir = path.join(tmp, "Empty Garden")
    fs.mkdirSync(dir)
    const c = loadConfig(dir, {})
    expect(c.title).toEqual({ "en-US": "Empty Garden" })
    expect(c.vault).toBe(dir)
  })

  test("a config that is not YAML is a ConfigError naming the file", () => {
    const dir = path.join(tmp, "broken")
    fs.mkdirSync(dir)
    const file = path.join(dir, CONFIG_FILES[0])
    fs.writeFileSync(file, "site: [unclosed\n")
    let err: unknown
    try {
      loadConfig(dir, {})
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ConfigError)
    expect((err as Error).name).toBe("ConfigError")
    expect((err as Error).message).toContain(`Cannot parse ${file}`)
  })

  test("the environment of the process is the default", () => {
    expect(loadConfig(path.join(tmp, "Empty Garden")).langs).toEqual(["en-US"])
  })

  test("without any variable, the vault is the working directory", () => {
    expect(vaultFromEnv({})).toBe(process.cwd())
    expect(vaultFromEnv({ DATME_VAULT: "~" })).toBe(os.homedir())
    expect(vaultFromEnv()).toBe(path.resolve(process.env.DATME_VAULT || process.env.VAULT_PATH!))
  })
})
