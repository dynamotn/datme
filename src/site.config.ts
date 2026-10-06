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

// Values that end up inside a <style> element must not be able to close a rule.
const cssColor = z
  .string()
  .regex(/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([\d\s.,%/+-]+\)|[a-zA-Z]+)$/, "expected a CSS colour")
const fontFamily = z.string().regex(/^[\p{L}\p{N} _-]+$/u, "expected a font family name")

/** Icons for common note types (from tags like type/book); datme.yaml can add or override them. */
const DEFAULT_TYPES: Record<string, string> = {
  article: "📰",
  blog: "✍️",
  book: "📕",
  composition: "🎼",
  example: "🧪",
  insight: "💡",
  memorial: "🕯️",
  methodology: "🧭",
  moc: "🗺️",
  notion: "💭",
  organization: "🏢",
  person: "👤",
  place: "📍",
  quote: "💬",
  summary: "📝",
  term: "🔤",
  thing: "📦",
  tool: "🔧",
  vault: "🗄️",
  video: "🎬",
}

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
        /** Profiles that link back to the site, as rel="me" (verifies the site on Mastodon). */
        me: z.array(z.url()).default([]),
        /** Fediverse handle credited when a note is shared on Mastodon, e.g. @me@mastodon.social. */
        fediverse: z.string().regex(/^@[^@\s]+@[^@\s]+$/, "expected @user@host").optional(),
      })
      .strict()
      .default({ me: [] }),
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
        /** Notes with one of these tags turn `Q::A` and `?` cards into flashcards. */
        flashcardTags: z.array(z.string()).default(["flashcards"]),
      })
      .strict()
      .default({
        typePrefix: "type/",
        blogTags: ["type/blog", "blog"],
        mapTags: ["type/moc", "moc"],
        flashcardTags: ["flashcards"],
      }),
    footer: z.record(z.string(), z.string()).default({}),
    /** Main menu, in order: built-in pages, notes (by wikilink target) or plain URLs. */
    nav: z
      .array(
        z.union([
          z.enum(["home", "tags", "archive"]),
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
    properties: z
      .object({
        /** Frontmatter keys left out of a note's properties block, on top of the built-in ones. */
        hide: z.array(z.string()).default([]),
      })
      .strict()
      .default({ hide: [] }),
    /** Note types (the part after conventions.typePrefix): an icon and an optional label. */
    types: z.record(z.string(), z.object({ icon: z.string().min(1), label: localized.optional() }).strict()).default({}),
    /** Receive webmentions through webmention.io and show them under each note. */
    webmentions: z
      .object({
        /** The webmention.io account; defaults to the host of site.url. */
        domain: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    /** Keep single line breaks, as Obsidian does by default; for poems and lyrics. */
    lineBreaks: z
      .object({
        all: z.boolean().default(false),
        /** Note types (from tags like type/composition) that keep their line breaks. */
        types: z.array(z.string()).default([]),
        folders: z.array(z.string()).default([]),
      })
      .strict()
      .default({ all: false, types: [], folders: [] }),
    theme: z
      .object({
        /** Accent colour of links and highlights; one value, or one per colour scheme. */
        accent: z.union([cssColor, z.object({ light: cssColor, dark: cssColor }).strict()]).optional(),
        /** Google Fonts families for headings and UI, reading text and code. */
        fonts: z
          .object({ heading: fontFamily.optional(), body: fontFamily.optional(), code: fontFamily.optional() })
          .strict()
          .default({}),
        /** A stylesheet in the vault, loaded after datme's own. */
        css: z.string().default("datme.css"),
      })
      .strict()
      .default({ fonts: {}, css: "datme.css" }),
    related: z
      .object({
        /** How many related notes to suggest under each note; 0 turns them off. */
        count: z.number().int().min(0).default(5),
        /** List notes that name this one without linking to it. */
        mentions: z.boolean().default(true),
      })
      .strict()
      .default({ count: 5, mentions: true }),
    /** Offer the stacked-notes mode, where links open side by side. */
    stackedPages: z.boolean().default(true),
    /** Make the site installable and keep the pages a reader opened available offline. */
    offline: z.boolean().default(true),
    /** Generate social preview images for the home page and for notes without a banner. */
    ogImages: z.boolean().default(true),
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
  kind: "home" | "tags" | "archive" | "note" | "url"
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
  const url = (env.DATME_SITE_URL ?? c.site.url)?.replace(/\/+$/, "")
  let webmentions: { domain: string } | undefined
  if (c.webmentions) {
    const domain = c.webmentions.domain ?? (url ? new URL(url).host : undefined)
    if (!domain) throw new ConfigError(`Invalid datme config in ${vault}:\n  - webmentions: needs site.url or webmentions.domain`)
    webmentions = { domain }
  }
  for (const [folder, def] of Object.entries(c.stages)) {
    const base = typeof def === "string" ? STAGE_PRESETS[def] : def
    stages[folder] = { icon: base.icon, label: localize(base.label, langs, folder), order: order++ }
  }
  return {
    vault,
    url,
    title: localize(c.site.title, langs, name),
    tagline: localize(c.site.tagline, langs, ""),
    author: c.site.author ?? "",
    me: c.site.me,
    fediverse: c.site.fediverse,
    webmentions,
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
    ogImages: c.ogImages,
    offline: c.offline,
    stackedPages: c.stackedPages,
    related: c.related,
    theme: { ...c.theme, css: c.theme.css.replace(/^\/+/, "") },
    lineBreaks: { ...c.lineBreaks, folders: c.lineBreaks.folders.map((p) => p.replace(/^\/+|\/+$/g, "")) },
    properties: c.properties,
    types: Object.fromEntries(
      [...new Set([...Object.keys(DEFAULT_TYPES), ...Object.keys(c.types)])].map((type) => [
        type,
        {
          icon: c.types[type]?.icon ?? DEFAULT_TYPES[type],
          label: localize(c.types[type]?.label, langs, type),
        },
      ]),
    ) as Record<string, { icon: string; label: Record<Lang, string> }>,
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
