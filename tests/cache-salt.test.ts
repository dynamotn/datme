import { describe, expect, test } from "bun:test"
import path from "node:path"
import { configSalt, SALT_KEYS } from "../src/lib/cache-salt"
import { loadConfig, resolveConfig, type SiteConfig } from "../src/site.config"

const FIXTURE = path.resolve(import.meta.dir, "fixtures/vault")
const defaults = () => resolveConfig({}, FIXTURE)

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** Some other value of the same shape, whatever the value is. */
function changed(v: unknown): unknown {
  if (v === undefined || v === null) return "set"
  if (typeof v === "string") return `${v}-changed`
  if (typeof v === "number") return v + 1
  if (typeof v === "boolean") return !v
  if (Array.isArray(v)) return [...v, "added"]
  return { ...(v as object), added: true }
}

/** The config with one key, or one key of a nested object, set to another value. */
function withChange(top: string, nested?: string): SiteConfig {
  const config = structuredClone(defaults()) as Record<string, unknown>
  if (nested === undefined) config[top] = changed(config[top])
  else {
    // An optional object the defaults leave out gets made, with just that key.
    const parent = (config[top] ?? {}) as Record<string, unknown>
    config[top] = { ...parent, [nested]: changed(parent[nested]) }
  }
  return config as SiteConfig
}

const entries = Object.entries(SALT_KEYS) as [string, (typeof SALT_KEYS)[keyof typeof SALT_KEYS]][]
const salted: [string, string?][] = []
const skipped: [string, string?][] = []
for (const [key, rule] of entries) {
  if (rule === "salt") salted.push([key])
  else if (rule === "skip") skipped.push([key])
  else for (const [sub, r] of Object.entries(rule)) (r === "salt" ? salted : skipped).push([key, sub])
}
const label = ([top, nested]: [string, string?]) => (nested ? `${top}.${nested}` : top)

/**
 * Objects with no fixed set of keys to list: texts by language, maps keyed by the vault's own names,
 * and services whose keys depend on the provider. The fixture vault sets each of them.
 */
const UNLISTABLE = ["title", "tagline", "types", "analytics", "comments", "subscribe"]

describe("which config keys salt the render cache", () => {
  test("every key of the resolved config is listed, as salted or as skipped, and nothing else is", () => {
    expect(Object.keys(SALT_KEYS).sort()).toEqual(Object.keys(defaults()).sort())
  })

  // The type of SALT_KEYS lists optional keys too, and refuses a key the config does not have.
  test("an object listed key by key lists every key it has", () => {
    for (const config of [defaults(), loadConfig(FIXTURE, {})] as Record<string, unknown>[]) {
      for (const [key, rule] of entries) {
        if (typeof rule !== "object" || !isPlainObject(config[key])) continue
        const unlisted = Object.keys(config[key]).filter((k) => !(k in rule))
        expect([key, unlisted]).toEqual([key, []])
      }
    }
  })

  test("an object of datme's own keys is never skipped whole: a key added to it later must be placed", () => {
    for (const config of [defaults(), loadConfig(FIXTURE, {})] as Record<string, unknown>[]) {
      const whole = entries.filter(([key, rule]) => rule === "skip" && isPlainObject(config[key]) && !UNLISTABLE.includes(key)).map(([key]) => key)
      expect(whole).toEqual([])
    }
  })

  test("the salt is the same for the same config, and keeps nothing of a skipped key", () => {
    expect(configSalt(defaults())).toBe(configSalt(defaults()))
    expect(configSalt(defaults())).not.toContain('"nav"')
  })

  test.each(salted.map((k) => [label(k), k] as const))("changing %s renders the notes again", (_, [top, nested]) => {
    expect(configSalt(withChange(top, nested))).not.toBe(configSalt(defaults()))
  })

  test.each(skipped.map((k) => [label(k), k] as const))("changing %s keeps the cached notes", (_, [top, nested]) => {
    expect(configSalt(withChange(top, nested))).toBe(configSalt(defaults()))
  })

  test("edits of datme.yaml that only touch the frame of a page keep the cache", () => {
    const base = configSalt(resolveConfig({ nav: ["home", { note: "About", label: "About" }] }, FIXTURE))
    for (const raw of [
      { nav: ["home", { note: "About", label: "About me" }] },
      { nav: ["home", { note: "About", label: "About" }], footer: { Mastodon: "https://mastodon.example/@me" } },
      { nav: ["home", { note: "About", label: "About" }], sidebar: [{ url: "https://example.com", label: "Friend" }] },
      { nav: ["home", { note: "About", label: "About" }], site: { title: "Another title", author: "Someone" } },
      { nav: ["home", { note: "About", label: "About" }], analytics: { provider: "plausible" }, poweredBy: false },
      { nav: ["home", { note: "About", label: "About" }], appearance: { style: "classic" }, theme: { accent: "#123456", mermaid: "forest" } },
    ]) {
      expect(configSalt(resolveConfig(raw, FIXTURE))).toBe(base)
    }
  })

  test("edits that reach a note's HTML, from datme.yaml or the environment, change the salt", () => {
    const base = configSalt(defaults())
    for (const config of [
      resolveConfig({ theme: { code: "nord" } }, FIXTURE),
      resolveConfig({ theme: { d2: 3 } }, FIXTURE),
      resolveConfig({ privateLinks: "hide" }, FIXTURE),
      resolveConfig({ languages: ["en-US", "vi-VN"] }, FIXTURE),
      resolveConfig({ images: { widths: [640] } }, FIXTURE),
      resolveConfig({ strings: { "en-US": { present: "Show" } } }, FIXTURE),
      resolveConfig({}, FIXTURE, { DATME_SITE_URL: "https://x.dev/garden" }),
      resolveConfig({}, FIXTURE, { DATME_DRAFTS: "1" }),
      resolveConfig({}, FIXTURE, { DATME_IGNORE: "public" }),
      resolveConfig({}, path.join(FIXTURE, "03_Atomic")),
    ]) {
      expect(configSalt(config)).not.toBe(base)
    }
  })
})
