import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { load as loadYaml } from "js-yaml"
import { z } from "astro/zod"

/** A BCP 47 language tag such as "en-US" or "vi-VN". */
export type Lang = string

export interface StageDef {
  icon: string
  label: Record<Lang, string>
  order: number
}

/** Config file names looked up at the root of the vault, in order. */
export const CONFIG_FILES = ["datme.yaml", "datme.yml", ".datme.yaml"]

/** Folders never scanned for notes, on top of the ones listed in the config. */
const DEFAULT_IGNORE = [".git", ".obsidian", ".trash", "node_modules", "private", "templates"]

/** Ready-made stages for Zettelkasten-style folders, usable by name in the config. */
const STAGE_PRESETS: Record<string, Omit<StageDef, "order">> = {
  fleeting: { icon: "🌱", label: { "vi-VN": "Thoáng qua", "en-US": "Fleeting" } },
  literature: { icon: "📖", label: { "vi-VN": "Tài liệu", "en-US": "Literature" } },
  atomic: { icon: "⚛️", label: { "vi-VN": "Nguyên tử", "en-US": "Atomic" } },
  permanent: { icon: "🌳", label: { "vi-VN": "Vĩnh viễn", "en-US": "Permanent" } },
  structure: { icon: "🗺️", label: { "vi-VN": "Cấu trúc", "en-US": "Structure" } },
  reference: { icon: "📚", label: { "vi-VN": "Tham khảo", "en-US": "Reference" } },
  project: { icon: "🛠️", label: { "vi-VN": "Dự án", "en-US": "Project" } },
}

const localized = z.union([z.string(), z.record(z.string(), z.string())])

const schema = z
  .object({
    site: z
      .object({
        title: localized.optional(),
        tagline: localized.optional(),
        url: z.url().optional(),
        author: z.string().optional(),
        /** One letter or emoji shown as the logo and favicon. */
        logo: z.string().min(1).max(8).optional(),
      })
      .strict()
      .default({}),
    languages: z.array(z.string().min(2)).min(1).default(["en-US"]),
    ignore: z.array(z.string()).default([]),
    stages: z
      .record(
        z.string(),
        z.union([
          z.enum(Object.keys(STAGE_PRESETS) as [string, ...string[]]),
          z.object({ icon: z.string(), label: localized }).strict(),
        ]),
      )
      .default({}),
    /** explicit: only notes with `publish: true`; all: every note except `publish: false`. */
    publish: z.enum(["explicit", "all"]).default("explicit"),
    /** Vault-relative note rendered as the home page. */
    home: z.string().default("index.md"),
    conventions: z
      .object({
        /** Tags starting with this prefix give a note its types, shown as chips. */
        typePrefix: z.string().default("type/"),
        /** Notes with one of these tags are listed as blog posts on the home page. */
        blogTags: z.array(z.string()).default(["type/blog", "blog"]),
        /** Notes with one of these tags are listed as maps of content. */
        mapTags: z.array(z.string()).default(["type/moc", "moc"]),
      })
      .strict()
      .default({ typePrefix: "type/", blogTags: ["type/blog", "blog"], mapTags: ["type/moc", "moc"] }),
    footer: z.record(z.string(), z.string()).default({}),
    /** Main menu, in order: built-in pages, notes (by wikilink target) or plain URLs. */
    nav: z
      .array(
        z.union([
          z.enum(["home", "tags"]),
          z.object({ note: z.string().min(1), label: localized.optional() }).strict(),
          z.object({ url: z.string().min(1), label: localized }).strict(),
        ]),
      )
      .default(["home", "tags"]),
    analytics: z
      .discriminatedUnion("provider", [
        z.object({ provider: z.literal("google"), id: z.string().min(1) }).strict(),
        z.object({ provider: z.literal("plausible"), host: z.string().optional() }).strict(),
        z.object({ provider: z.literal("umami"), id: z.string().min(1), host: z.string().min(1) }).strict(),
        z.object({ provider: z.literal("goatcounter"), id: z.string().min(1) }).strict(),
      ])
      .optional(),
    comments: z
      .discriminatedUnion("provider", [
        z
          .object({
            provider: z.literal("giscus"),
            repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, "expected owner/name"),
            repoId: z.string().min(1),
            category: z.string().min(1),
            categoryId: z.string().min(1),
            mapping: z.enum(["pathname", "url", "title", "og:title"]).default("pathname"),
            reactions: z.boolean().default(true),
          })
          .strict(),
        z.object({ provider: z.literal("commento"), host: z.string().default("https://cdn.commento.io") }).strict(),
      ])
      .optional(),
    /** Write a CNAME file with the host of site.url, for GitHub/GitLab Pages custom domains. */
    cname: z.boolean().default(false),
    encryption: z
      .object({
        /** PBKDF2 rounds for notes with a `password`; higher is slower to unlock and to brute-force. */
        iterations: z.number().int().min(100_000).default(600_000),
      })
      .strict()
      .default({ iterations: 600_000 }),
    appearance: z
      .object({
        /** notebook: index cards on dotted paper; classic: the quiet serif blog look. */
        style: z.enum(["notebook", "classic"]).default("notebook"),
        /** Folders whose notes use the other style, e.g. long-form writing. */
        classic: z.array(z.string()).default([]),
      })
      .strict()
      .default({ style: "notebook", classic: [] }),
    /** Per-language overrides of UI strings, e.g. { en-US: { blog: Posts } }. */
    strings: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  })
  .strict()

export type RawConfig = z.input<typeof schema>

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p
}

/** Pick a value for every language: exact tag, then same base language, then the first one. */
function localize(v: z.infer<typeof localized> | undefined, langs: Lang[], fallback: string): Record<Lang, string> {
  const out: Record<Lang, string> = {}
  for (const lang of langs) {
    if (typeof v === "string") out[lang] = v
    else if (v) {
      const base = lang.split("-")[0]
      out[lang] =
        v[lang] ?? Object.entries(v).find(([k]) => k.split("-")[0] === base)?.[1] ?? Object.values(v)[0] ?? fallback
    } else out[lang] = fallback
  }
  return out
}

export interface NavItem {
  kind: "home" | "tags" | "note" | "url"
  /** Wikilink target for notes, href for URLs. */
  target?: string
  label?: Record<Lang, string>
}

export class ConfigError extends Error {
  override name = "ConfigError"
}

/** Validate a parsed config and fill in every default. Pure, so it can be tested. */
export function resolveConfig(raw: unknown, vault: string, env: Record<string, string | undefined> = {}) {
  const parsed = schema.safeParse(raw ?? {})
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")
    throw new ConfigError(`Invalid datme config in ${vault}:\n${issues}`)
  }
  const c = parsed.data
  const langs = [...new Set(c.languages)]
  const name = path.basename(vault) || "Notes"
  let order = 0
  const stages: Record<string, StageDef> = {}
  for (const [folder, def] of Object.entries(c.stages)) {
    const base = typeof def === "string" ? STAGE_PRESETS[def] : def
    stages[folder] = { icon: base.icon, label: localize(base.label, langs, folder), order: order++ }
  }
  return {
    vault,
    url: (env.DATME_SITE_URL ?? c.site.url)?.replace(/\/+$/, ""),
    title: localize(c.site.title, langs, name),
    tagline: localize(c.site.tagline, langs, ""),
    author: c.site.author ?? "",
    // Default logo: the first letter of the title, skipping any leading emoji.
    logo: c.site.logo ?? localize(c.site.title, langs, name)[langs[0]].match(/\p{L}/u)?.[0]?.toUpperCase() ?? "✦",
    defaultLang: langs[0],
    langs,
    // DATME_IGNORE is set by the CLI when the output directory sits inside the vault.
    ignore: [
      ...new Set(
        [...DEFAULT_IGNORE, ...c.ignore, ...(env.DATME_IGNORE ? [env.DATME_IGNORE] : [])].map((p) =>
          p.replace(/^\/+|\/+$/g, ""),
        ),
      ),
    ],
    stages,
    publish: c.publish,
    home: c.home.replace(/^\/+/, ""),
    conventions: c.conventions,
    footerLinks: c.footer,
    nav: c.nav.map((item): NavItem =>
      typeof item === "string"
        ? { kind: item }
        : "note" in item
          ? { kind: "note", target: item.note, label: item.label ? localize(item.label, langs, item.note) : undefined }
          : { kind: "url", target: item.url, label: localize(item.label, langs, item.url) },
    ),
    encryption: c.encryption,
    analytics: c.analytics,
    comments: c.comments,
    cname: c.cname,
    appearance: {
      style: c.appearance.style,
      classic: c.appearance.classic.map((p) => p.replace(/^\/+|\/+$/g, "")),
    },
    strings: c.strings,
  }
}

export type SiteConfig = ReturnType<typeof resolveConfig>

/** Find and parse the config file of a vault; a vault without one gets the defaults. */
export function loadConfig(vault: string, env: Record<string, string | undefined> = process.env): SiteConfig {
  for (const name of CONFIG_FILES) {
    const file = path.join(vault, name)
    if (!fs.existsSync(file)) continue
    let raw: unknown
    try {
      raw = loadYaml(fs.readFileSync(file, "utf8"))
    } catch (e) {
      throw new ConfigError(`Cannot parse ${file}: ${(e as Error).message}`)
    }
    return resolveConfig(raw, vault, env)
  }
  return resolveConfig({}, vault, env)
}

/** The vault to publish: DATME_VAULT (set by the CLI), VAULT_PATH, or the working directory. */
export function vaultFromEnv(env: Record<string, string | undefined> = process.env): string {
  return path.resolve(expandHome(env.DATME_VAULT || env.VAULT_PATH || process.cwd()))
}

export const site: SiteConfig = loadConfig(vaultFromEnv())
