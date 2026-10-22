import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseYaml } from "./lib/yaml"
import { z } from "astro/zod"
import { bundledThemes } from "shiki"
import { folderDisplayName, slugTag } from "./lib/slug"
import { CONFIG_FILES } from "./lib/config-files"
import { basePath, useSite } from "./lib/base"
import { loadPack, PACK_STYLE_NAME, PACK_THEME_KEYS, type PackStyle } from "./lib/theme-pack"

/** A small multilingual sentence model: Vietnamese, English and 50 other languages. */
export const SEMANTIC_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"

/** A BCP 47 language tag such as "en-US" or "vi-VN". */
export type Lang = string

/** Every site style; `appearance.style` and `appearance.folders` take one of these. */
export const STYLES = [
  "notebook",
  "classic",
  "garden",
  "resume",
  "darkroom",
  "terminal",
  "blueprint",
  "wiki",
  "broadsheet",
  "herbarium",
  "manuscript",
  "lacquer",
  "zine",
  "atlas",
  "catalog",
  "eink",
  "paddy",
] as const
export type Style = (typeof STYLES)[number]
/** Tiles of a bento home, in their default order. */
export const BENTO_TILES = ["now", "recent", "random", "stats", "graph", "stream", "tags"] as const
export type BentoTile = (typeof BENTO_TILES)[number]

/** A built-in style, or one a theme pack adds on top of one. */
export type StyleName = string
/** Styles made for a single page (a résumé, a gallery) rather than a whole site. */
export const PAGE_STYLES: readonly Style[] = ["resume", "darkroom"]
/**
 * Styles that lay their pages out their own way (a front page, an infobox, a specimen label, a region, a call
 * number), not only colour them.
 */
export const SHAPED_STYLES: readonly Style[] = ["broadsheet", "wiki", "herbarium", "atlas", "catalog"]

export interface StageDef {
  icon: string
  label: Record<Lang, string>
  order: number
}

/** Config file names looked up at the root of the vault, in order. */
export { CONFIG_FILES }

/** Folders never scanned for notes, on top of the ones listed in the config. */
const DEFAULT_IGNORE = [".git", ".obsidian", ".trash", "node_modules", "private", "templates"]

/**
 * The three kinds of note of a Zettelkasten, usable by name in the config.
 * English first: other languages fall back to it. Any other stage is the
 * vault's own: a label, or an icon and a label.
 */
const STAGE_PRESETS: Record<string, Omit<StageDef, "order">> = {
  fleeting: { icon: "🌱", label: { "en-US": "Fleeting", "vi-VN": "Thoáng qua" } },
  literature: { icon: "📖", label: { "en-US": "Literature", "vi-VN": "Tài liệu" } },
  permanent: { icon: "🌳", label: { "en-US": "Permanent", "vi-VN": "Vĩnh viễn" } },
}

/** The icon of a stage the config gives none. */
const STAGE_ICON = "🗂️"

const localized = z.union([z.string(), z.record(z.string(), z.string())])

// Values that end up inside a <style> element must not be able to close a rule.
const cssColor = z
  .string()
  .regex(/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([\d\s.,%/+-]+\)|[a-zA-Z]+)$/, "expected a CSS colour")
const fontFamily = z.string().regex(/^[\p{L}\p{N} _-]+$/u, "expected a font family name")

/** A theme per colour scheme, or one for both: embedded tools follow the site's scheme. */
const themePair = <T extends z.ZodType<string | number>>(name: T) =>
  z
    .union([name, z.object({ light: name, dark: name }).strict()])
    .transform((v) => (typeof v === "object" ? v : { light: v, dark: v }) as { light: z.output<T>; dark: z.output<T> })
/** Entries of a menu: built-in pages, notes (by wikilink target) or plain URLs. */
const menuEntries = z.array(
  z.union([
    z.enum(["home", "tags", "archive", "recent", "timeline", "map", "stats", "calendar", "practice", "changes"]),
    z.object({ note: z.string().min(1), label: localized.optional() }).strict(),
    z.object({ url: z.string().min(1), label: localized }).strict(),
  ]),
)
type MenuEntry = z.infer<typeof menuEntries>[number]

const shikiTheme = z.string().refine((n) => n in bundledThemes, { message: "expected a Shiki theme, see https://shiki.style/themes" })
// giscus takes its own theme names, or the URL of a stylesheet.
const giscusTheme = z.string().regex(/^([\w-]+|https:\/\/\S+)$/, "expected a giscus theme name or an https:// URL")
const mermaidTheme = z.enum(["default", "neutral", "dark", "forest", "base"])
// D2 numbers its themes: https://d2lang.com/tour/themes
const d2Theme = z.number().int().min(0)
const TOOL_THEMES = {
  code: { light: "github-light", dark: "github-dark" },
  comments: { light: "light", dark: "dark" },
  mermaid: { light: "neutral", dark: "dark" },
  d2: { light: 0, dark: 200 },
} as const

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

/** Days in each month, February's leap day included: a schedule's dates come back every year. */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
/** A day of the year as MM-DD, e.g. "01-20". */
const monthDay = z
  .string()
  .regex(/^\d\d-\d\d$/, "expected a day of the year as MM-DD, e.g. 01-20")
  .refine((v) => {
    const [m, d] = v.split("-").map(Number)
    return m >= 1 && m <= 12 && d >= 1 && d <= MONTH_DAYS[m - 1]
  }, "expected a day of the year as MM-DD, e.g. 01-20")

/** The `theme:` values a theme pack can set too, checked alike. */
const themeFields = {
  /** Colour scheme before the reader picks one with the toggle; auto follows their system. */
  scheme: z.enum(["auto", "light", "dark"]).default("auto"),
  /** Accent colour of links and highlights; one value, or one per colour scheme. */
  accent: z.union([cssColor, z.object({ light: cssColor, dark: cssColor }).strict()]).optional(),
  /** Font families for headings and UI, reading text and code: from Google Fonts, unless a theme pack ships them. */
  fonts: z
    .object({ heading: fontFamily.optional(), body: fontFamily.optional(), code: fontFamily.optional() })
    .strict()
    .default({}),
  /** Shiki themes of code blocks. */
  code: themePair(shikiTheme).default(TOOL_THEMES.code),
  /** giscus themes of the comments. */
  comments: themePair(giscusTheme).default(TOOL_THEMES.comments),
  /** Mermaid themes of ```mermaid diagrams. */
  mermaid: themePair(mermaidTheme).default(TOOL_THEMES.mermaid),
  /** D2 theme ids of ```d2 diagrams, unless a diagram picks its own. */
  d2: themePair(d2Theme).default(TOOL_THEMES.d2),
} satisfies Record<(typeof PACK_THEME_KEYS)[number], z.ZodType>

/** The schema of datme.yaml; styles are the built-in ones and those of the theme pack. */
const makeSchema = (styles: readonly [StyleName, ...StyleName[]]) => z
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
    /**
     * Folder (or `stage` property value) to stage: a preset name, a label of
     * the vault's own, or an icon and a label, either of which may be left out.
     */
    stages: z
      .record(
        z.string(),
        z.union([z.string().min(1), z.object({ icon: z.string().min(1).optional(), label: localized.optional() }).strict(), z.null()]),
      )
      .default({}),
    /** explicit: only notes with `publish: true`; all: every note except `publish: false`. */
    publish: z.enum(["explicit", "all"]).default("explicit"),
    /**
     * What a link to a note that is not published shows: text, its words as written;
     * placeholder, a neutral "a private note"; hide, nothing unless the link has an alias.
     */
    privateLinks: z.enum(["text", "placeholder", "hide"]).default("text"),
    /**
     * Vault-relative note rendered as the home page; `bento` keeps index.md and lays the home out as a
     * dashboard of tiles, which the long form chooses: { note, layout: bento, tiles: [now, recent…] }.
     */
    home: z
      .union([
        z.string(),
        z
          .object({
            note: z.string().default("index.md"),
            layout: z.enum(["default", "bento"]).default("default"),
            tiles: z.array(z.enum(BENTO_TILES)).min(1).default([...BENTO_TILES]),
          })
          .strict(),
      ])
      .default("index.md"),
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
        /** Notes with one of these tags are timeline events, dated by `date` when they have no `start`. */
        timelineTags: z.array(z.string()).default(["timeline", "type/event"]),
        /** Highest `rating` a note can have: ratings are drawn as that many stars. */
        ratingScale: z.number().int().min(2).max(10).default(5),
      })
      .strict()
      .default({
        typePrefix: "type/",
        blogTags: ["type/blog", "blog"],
        mapTags: ["type/moc", "moc"],
        flashcardTags: ["flashcards"],
        timelineTags: ["timeline", "type/event"],
        ratingScale: 5,
      }),
    /**
     * Columns of links in the footer: a heading to a list of entries written like `nav`.
     * A heading to a URL is a single link instead; such links share one column without a heading.
     */
    footer: z.record(z.string(), z.union([z.string().min(1), menuEntries])).default({}),
    /** A small "grown with datme" line, with its sprout, at the end of the footer. */
    poweredBy: z.boolean().default(true),
    /** Main menu, in order: built-in pages, notes (by wikilink target) or plain URLs. */
    nav: menuEntries.default(["home", "tags"]),
    /** Shortcuts at the top of the left sidebar, with the same kinds of entry as `nav`. */
    sidebar: menuEntries.default([]),
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
    /**
     * A page per note showing how it grew, from its git history. Off by default:
     * it publishes what was later deleted. `history: false` in a note opts it out.
     */
    history: z.boolean().default(false),
    /** A form to get new notes by email, under notes and on folder and tag pages. */
    subscribe: z
      .discriminatedUnion("provider", [
        z.object({ provider: z.literal("buttondown"), username: z.string().regex(/^[\w-]+$/, "expected a Buttondown username") }).strict(),
        z
          .object({
            provider: z.literal("form"),
            /** Where the form posts, e.g. a Mailchimp, ConvertKit or listmonk URL. */
            action: z.url(),
            /** Name of the email field. */
            field: z.string().default("email"),
            /** Name of a hidden field carrying the topic (folder:…, tag:…), if the service takes one. */
            topicField: z.string().optional(),
          })
          .strict(),
      ])
      .optional(),
    properties: z
      .object({
        /** Frontmatter keys left out of a note's properties block, on top of the built-in ones. */
        hide: z.array(z.string()).default([]),
        /** When set, the only frontmatter keys a properties block may show; any other key stays home. */
        show: z.array(z.string()).optional(),
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
        ...themeFields,
        /** A theme pack the values above override: a folder of the vault, or a datme-theme-* package. */
        preset: z.string().min(1).optional(),
        /** A stylesheet in the vault, loaded after datme's own. */
        css: z.string().default("datme.css"),
      })
      .strict()
      .default({ scheme: "auto", fonts: {}, css: "datme.css", ...TOOL_THEMES }),
    related: z
      .object({
        /** How many related notes to suggest under each note; 0 turns them off. */
        count: z.number().int().min(0).default(5),
        /** List notes that name this one without linking to it. */
        mentions: z.boolean().default(true),
        /**
         * Also suggest notes similar in meaning, from embeddings computed on this
         * machine at build time (needs @huggingface/transformers installed).
         */
        semantic: z
          .union([
            z.boolean(),
            z
              .object({
                model: z.string().default(SEMANTIC_MODEL),
                /** Cosine similarity from which two notes count as related, 0 to 1. */
                threshold: z.number().min(0).max(1).default(0.55),
              })
              .strict(),
          ])
          .default(false)
          .transform((v) => (v === true ? { model: SEMANTIC_MODEL, threshold: 0.55 } : v)),
      })
      .strict()
      .default({ count: 5, mentions: true, semantic: false }),
    /** Read notes aloud in the author's voice at build time, one model per language. */
    tts: z
      .object({
        /** Language (or its base, as vi for vi-VN) to the model that speaks it. */
        models: z.record(z.string(), z.literal("vieneu")),
        /** Vault folders whose notes get audio. */
        folders: z.array(z.string()).default([]),
        /** Frontmatter values that give a note audio. */
        frontmatter: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
      })
      .strict()
      .optional(),
    /**
     * Group notes into topics from the embeddings of related.semantic, for the graph and /stats:
     * true picks how many from the number of notes, a number sets it, false turns topics off.
     */
    topics: z.union([z.boolean(), z.number().int().min(2).max(40)]).default(true),
    /** Offer the stacked-notes mode, where links open side by side. */
    stackedPages: z.boolean().default(true),
    graph: z
      .object({
        /** Links the local graph of a note follows: 1 for its own links, 2 for theirs too; readers can switch. */
        depth: z.union([z.literal(1), z.literal(2)]).default(1),
        /** How the global graph opens: flat, or laid out in space and turned by dragging; readers can switch. */
        view: z.enum(["2d", "3d"]).default("2d"),
      })
      .strict()
      .default({ depth: 1, view: "2d" }),
    images: z
      .object({
        /** Resize raster images into WebP copies and let browsers pick the smallest that fits. */
        optimize: z.boolean().default(true),
        /** Widths of the resized copies, in pixels; only those below the original are made. */
        widths: z.array(z.number().int().min(64).max(4096)).min(1).default([480, 960, 1600]),
        quality: z.number().int().min(1).max(100).default(80),
        /** Show a tiny blurred copy of each image while it loads. */
        placeholders: z.boolean().default(true),
        /** Publish original images with their EXIF, XMP and IPTC (camera, time, GPS position) instead of without. */
        keepMetadata: z.boolean().default(false),
      })
      .strict()
      .default({ optimize: true, widths: [480, 960, 1600], quality: 80, placeholders: true, keepMetadata: false }),
    /**
     * Search engine of the site: minisearch loads every note's text at once, which suits most
     * gardens; pagefind indexes the built pages and loads only what a query needs, for large ones.
     */
    search: z
      .object({
        engine: z.enum(["minisearch", "pagefind"]).default("minisearch"),
        /**
         * Offer readers to search by meaning too: their browser downloads the model of
         * related.semantic (about 120 MB, once) and blends closeness in meaning with the words.
         */
        meaning: z.boolean().default(false),
      })
      .strict()
      .default({ engine: "minisearch", meaning: false }),
    /** Turn a paragraph that is only a URL into a card with the page's title and image. */
    linkPreviews: z.boolean().default(true),
    check: z
      .object({
        /** Notices about the shape of the garden: orphan notes, dead ends and hubs. */
        structure: z.boolean().default(true),
      })
      .strict()
      .default({ structure: true }),
    /** Point links that `datme check --external` found dead at the Internet Archive's copy. */
    archiveDeadLinks: z.boolean().default(true),
    /** Link the first mention of a term (a note tagged type/term) to its note. */
    glossary: z.boolean().default(true),
    /** Tiles of the map page, for notes with a `location`. */
    map: z
      .object({
        tiles: z.string().default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
        /** Tiles drawn for the dark theme; without them the light tiles are inverted. */
        darkTiles: z.string().optional(),
        attribution: z.string().default('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'),
      })
      .strict()
      .default({
        tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }),
    /** BibTeX files, relative to the vault, that [@key] citations are looked up in. */
    bibliography: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    /**
     * Tell readers when a note has not been updated for this many years; `outdated: false`
     * in a note opts it out. Home and daily notes never get it.
     */
    outdated: z
      .object({ after: z.number().positive() })
      .strict()
      .optional(),
    stats: z
      .object({
        /** Garden health indicators left off /stats, for authors who prefer not to publish them. */
        hide: z.array(z.enum(["density", "structure", "freshness", "hubs", "topics"])).default([]),
      })
      .strict()
      .default({ hide: [] }),
    /** Make the site installable and keep the pages a reader opened available offline. */
    offline: z.boolean().default(true),
    /** Generate social preview images for the home page and for notes without a banner. */
    ogImages: z.boolean().default(true),
    /** Other datme gardens, by a short name: `[[name:Note]]` links to a note of one of them. */
    neighbours: z.record(z.string().regex(/^[\w-]+$/, "expected a short name: letters, digits, - or _"), z.url()).default({}),
    /**
     * Let the fediverse find the garden: `bridgy` hands it to Bridgy Fed, which people can follow;
     * `{ username }` publishes only a static actor and outbox, found but not followable. Needs site.url.
     */
    activitypub: z
      .union([z.literal("bridgy"), z.object({ username: z.string().regex(/^[\w.-]+$/, "expected a username: letters, digits, ., - or _") }).strict()])
      .optional(),
    /** Let other sites embed a card of each public note, by oEmbed; needs site.url. */
    oembed: z.boolean().default(true),
    /** Publish /llms.txt and a markdown copy of every public note, for readers and tools that want text. */
    llms: z.boolean().default(true),
    /** Chat assistants a note's markdown menu offers to open it in; needs llms and site.url. */
    askAi: z.array(z.enum(["chatgpt", "claude"])).default(["chatgpt", "claude"]),
    /**
     * Write a _headers file (Netlify, Cloudflare Pages) with safe defaults and caching; `false` skips
     * it. `csp: true` adds a Content-Security-Policy built from the features in use.
     */
    headers: z
      .union([z.literal(false), z.object({ csp: z.boolean().default(false) }).strict()])
      .default({ csp: false }),
    /** Write a _redirects file (Netlify, Cloudflare Pages) with 301s for aliases and old URLs. */
    redirects: z.boolean().default(true),
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
        /**
         * notebook: index cards on dotted paper; classic: the quiet serif blog look; garden: tiles sized by
         * maturity, recently tended first; herbarium: notes as pressed specimens; manuscript: a book page with
         * notes in its margin; lacquer: vermilion, black and gold leaf; zine: a cut-and-paste photocopied zine;
         * atlas: an old atlas, each top folder a region; catalog: a library card catalogue with call numbers;
         * eink: an e-reader's grey page, turned page by page if the reader likes; paddy: the garden as terraced
         * rice fields.
         */
        style: z.enum(styles).default("notebook"),
        /** Folders whose notes use the other style, e.g. long-form writing. */
        classic: z.array(z.string()).default([]),
        /** A style per folder, subfolders included, e.g. { Writing: classic }. */
        folders: z.record(z.string(), z.enum(styles)).default({}),
        /** A style per tag, nested tags included, e.g. { poem: classic }; a note's first matching tag wins. */
        tags: z.record(z.string(), z.enum(styles)).default({}),
        /** A style per growth stage, a key of `stages`, e.g. { 01_Fleeting: notebook }; after tags, before folders. */
        stages: z.record(z.string(), z.enum(styles)).default({}),
        /** A site-wide style per language (or its base, as vi for vi-VN), used instead of `style` on its pages. */
        languages: z.record(z.string(), z.enum(styles)).default({}),
        /**
         * Site-wide styles for days of the year, from and to included (a range may wrap the year): the first
         * entry covering the day of the build replaces `style` and `languages`.
         */
        schedule: z.array(z.object({ style: z.enum(styles), from: monthDay, to: monthDay }).strict()).default([]),
        /** Folders of short notes whose page shows each note in full, newest first, like a feed. */
        stream: z.array(z.string()).default([]),
        /**
         * The garden style's colours follow the season of the build, and of the reader's
         * day once the page opens: true for the northern hemisphere, or { hemisphere: south }.
         */
        seasons: z
          .union([z.boolean(), z.object({ hemisphere: z.enum(["north", "south"]).default("north") }).strict()])
          .default(false),
        /** Styles readers can pick from the View menu instead of the page's own; true for every site-wide style. */
        readerSwitch: z.union([z.boolean(), z.array(z.enum(styles)).min(1)]).default(false),
      })
      .strict()
      .default({ style: "notebook", classic: [], folders: {}, tags: {}, stages: {}, languages: {}, schedule: [], stream: [], seasons: false, readerSwitch: false }),
    /** Per-language overrides of UI strings, e.g. { en-US: { blog: Posts } }. */
    strings: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  })
  .strict()

export type TtsConfig = { models: Record<string, "vieneu">; folders: string[]; frontmatter: Record<string, string | number | boolean> }

export type RawConfig = z.input<ReturnType<typeof makeSchema>>

export type Hemisphere = "north" | "south"

/** `appearance.seasons` as the hemisphere whose seasons the garden follows, or false. */
function seasonsOf(v: boolean | { hemisphere: Hemisphere }): false | { hemisphere: Hemisphere } {
  if (v === true) return { hemisphere: "north" }
  return v
}

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

/** Footer columns in the order written; single links gather in a first column without a heading. */
function footerGroups(footer: Record<string, string | MenuEntry[]>, navItem: (item: MenuEntry) => NavItem, langs: Lang[]): FooterGroup[] {
  const loose: NavItem[] = []
  const groups: FooterGroup[] = []
  for (const [key, value] of Object.entries(footer)) {
    if (typeof value === "string") loose.push({ kind: "url", target: value, label: localize(key, langs, key) })
    else if (value.length) groups.push({ title: key, items: value.map(navItem) })
  }
  return loose.length ? [{ items: loose }, ...groups] : groups
}

export interface NavItem {
  kind: "home" | "tags" | "archive" | "recent" | "timeline" | "map" | "stats" | "calendar" | "practice" | "changes" | "note" | "url"
  /** Wikilink target for notes, href for URLs. */
  target?: string
  label?: Record<Lang, string>
}

/** A column of footer links, under its heading when it has one. */
export interface FooterGroup {
  title?: string
  items: NavItem[]
}

export class ConfigError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = "ConfigError"
  }
}

/** A problem of the config that does not stop the build, reported against a file as `datme check` does. */
export interface ConfigWarning {
  file: string
  message: string
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const isStyle = (name: unknown): name is Style => (STYLES as readonly unknown[]).includes(name)

/**
 * Lays the theme pack `theme.preset` names under the config: its values fill what `theme:`
 * leaves out, its style is the site's unless `appearance.style` is set, and its styles join the
 * built-in ones. Whatever is wrong with the pack is a warning, never a failed build.
 */
function withPack(raw: unknown, vault: string) {
  const config = isObject(raw) ? raw : {}
  const theme = isObject(config.theme) ? config.theme : {}
  const styles: Record<StyleName, PackStyle> = {}
  if (typeof theme.preset !== "string" || !theme.preset) return { raw, styles, warnings: [] as ConfigWarning[] }
  const { pack, warnings: found } = loadPack(theme.preset, vault)
  const warnings = found.map((message) => ({ file: pack?.file ?? "datme.yaml", message }))
  if (!pack) return { raw, styles, warnings }
  const warn = (message: string) => warnings.push({ file: pack.file, message })
  const label = `theme ${pack.preset}`
  const fromPack: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(pack.theme)) {
    const checked = themeFields[key as keyof typeof themeFields].safeParse(value)
    if (checked.success) fromPack[key] = value
    else warn(`${label}: ${key}: ${checked.error.issues[0].message}, so it is ignored`)
  }
  for (const [name, style] of Object.entries(pack.styles)) {
    if (isStyle(name)) warn(`${label}: styles.${name}: a built-in style has that name, so it is left out`)
    else if (!isStyle(style.base)) warn(`${label}: styles.${name}: base ${style.base} is not one of ${STYLES.join(", ")}, so it is left out`)
    else styles[name] = style
  }
  const appearance = isObject(config.appearance) ? config.appearance : {}
  let style = appearance.style
  if (style === undefined && pack.style !== undefined) {
    if (isStyle(pack.style) || (typeof pack.style === "string" && pack.style in styles)) style = pack.style
    else warn(`${label}: style ${JSON.stringify(pack.style)} is no style of datme or of the theme, so it is ignored`)
  }
  // Fonts merge one family at a time; a `fonts:` that is not a map is left for the schema to reject.
  const fonts = theme.fonts === undefined || isObject(theme.fonts) ? { ...(fromPack.fonts as object | undefined), ...theme.fonts } : theme.fonts
  return {
    raw: { ...config, theme: { ...fromPack, ...theme, fonts }, ...(style === undefined ? {} : { appearance: { ...appearance, style } }) },
    styles,
    warnings,
    // Where the accent comes from, for `datme check` to point at: the pack's file when datme.yaml sets none.
    pack: {
      dir: pack.dir,
      css: pack.css,
      fonts: pack.fonts,
      file: pack.file,
      accent: theme.accent === undefined && fromPack.accent !== undefined,
      ...(pack.templates && { templates: pack.templates }),
    },
  }
}

/** Validate a parsed config and fill in every default; only a theme pack is read from the vault. */
export function resolveConfig(raw: unknown, vault: string, env: Record<string, string | undefined> = {}) {
  const packed = withPack(raw, vault)
  const packStyles = packed.styles
  const styleNames: [StyleName, ...StyleName[]] = [...STYLES, ...Object.keys(packStyles)]
  /** The built-in style a style builds on: itself, or the base of a theme pack's. */
  const baseOf = (name: StyleName): Style => packStyles[name]?.base as Style | undefined ?? (name as Style)
  const parsed = makeSchema(styleNames).safeParse(packed.raw ?? {})
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")
    throw new ConfigError(`Invalid datme config in ${vault}:\n${issues}`)
  }
  const c = parsed.data
  const langs = [...new Set(c.languages)]
  const navItem = (item: MenuEntry): NavItem =>
    typeof item === "string"
      ? { kind: item }
      : "note" in item
        ? { kind: "note", target: item.note, label: item.label ? localize(item.label, langs, item.note) : undefined }
        : { kind: "url", target: item.url, label: localize(item.label, langs, item.url) }
  const name = path.basename(vault) || "Notes"
  let order = 0
  const stages: Record<string, StageDef> = {}
  // --site sets DATME_SITE_URL, which must be a URL as site.url is.
  if (env.DATME_SITE_URL && !z.url().safeParse(env.DATME_SITE_URL).success) {
    throw new ConfigError(`Invalid site URL "${env.DATME_SITE_URL}" from --site or DATME_SITE_URL: write it in full, as https://notes.example.com`)
  }
  const url = (env.DATME_SITE_URL ?? c.site.url)?.replace(/\/+$/, "")
  /** Set by `--drafts`: drafts and scheduled notes are built too, for previewing. */
  const drafts = env.DATME_DRAFTS === "1"
  let webmentions: { domain: string } | undefined
  if (c.webmentions) {
    const domain = c.webmentions.domain ?? (url ? new URL(url).host : undefined)
    if (!domain) throw new ConfigError(`Invalid datme config in ${vault}:\n  - webmentions: needs site.url or webmentions.domain`)
    webmentions = { domain }
  }
  if (c.activitypub && !url) {
    throw new ConfigError(`Invalid datme config in ${vault}:\n  - activitypub: needs site.url, the address other servers reach`)
  }
  // Other servers look the garden up at /.well-known/ of its host, which a site under a path does not own.
  const base = basePath(url)
  if (c.activitypub && base !== "/") {
    throw new ConfigError(`Invalid datme config in ${vault}:\n  - activitypub: needs a site.url at the root of its host, not under ${base}`)
  }
  if (c.search.meaning && !c.related.semantic) {
    throw new ConfigError(`Invalid datme config in ${vault}:\n  - search.meaning: needs related.semantic, whose model it uses`)
  }
  if (c.tts) {
    for (const key of Object.keys(c.tts.models)) {
      if (!langs.some((l) => l === key || l.split("-")[0] === key)) {
        throw new ConfigError(`Invalid datme config in ${vault}:\n  - tts.models.${key}: matches none of the languages ${langs.join(", ")}`)
      }
    }
    c.tts.folders = c.tts.folders.map((p) => p.replace(/^\/+|\/+$/g, ""))
    if (c.tts.folders.includes("")) {
      throw new ConfigError(`Invalid datme config in ${vault}:\n  - tts.folders: an empty folder names no folder of the vault`)
    }
    if (!c.tts.folders.length && !Object.keys(c.tts.frontmatter).length) {
      throw new ConfigError(`Invalid datme config in ${vault}:\n  - tts: selects no notes, set tts.folders or tts.frontmatter`)
    }
  }
  const { readerSwitch } = c.appearance
  // A pack's style with templates of its own reshapes its pages, which the reader switch cannot do.
  const templated = (st: StyleName) => !!packStyles[st]?.templates
  for (const st of Array.isArray(readerSwitch) ? readerSwitch.filter(templated) : []) {
    packed.warnings.push({ file: "datme.yaml", message: `appearance.readerSwitch: ${st} has templates of its own that reshape its pages, so readers cannot pick it` })
  }
  const pageStyle = Array.isArray(readerSwitch) && readerSwitch.find((st) => PAGE_STYLES.includes(baseOf(st)))
  if (pageStyle) {
    throw new ConfigError(`Invalid datme config in ${vault}:\n  - appearance.readerSwitch: ${pageStyle} is made for a single page, so readers cannot pick it for the site`)
  }
  // The switch swaps stylesheets only, so a page built for one of these would lose its frame, or keep it in the wrong style.
  const shaped = Array.isArray(readerSwitch) && readerSwitch.find((st) => SHAPED_STYLES.includes(baseOf(st)))
  if (shaped) {
    throw new ConfigError(`Invalid datme config in ${vault}:\n  - appearance.readerSwitch: ${shaped} lays its pages out its own way, so readers cannot pick it`)
  }
  for (const key of Object.keys(c.appearance.stages)) {
    if (!(key in c.stages)) throw new ConfigError(`Invalid datme config in ${vault}:\n  - appearance.stages.${key}: is no stage of \`stages\``)
  }
  for (const key of Object.keys(c.appearance.languages)) {
    if (!langs.some((l) => l === key || l.split("-")[0] === key)) {
      throw new ConfigError(`Invalid datme config in ${vault}:\n  - appearance.languages.${key}: matches none of the languages ${langs.join(", ")}`)
    }
  }
  for (const [folder, def] of Object.entries(c.stages)) {
    // A string naming no preset is the stage's label; without one, the folder's name is.
    const preset = typeof def === "string" ? STAGE_PRESETS[def.toLowerCase()] : undefined
    const own = preset ?? (typeof def === "string" ? { label: def } : (def ?? {}))
    stages[folder] = { icon: own.icon ?? STAGE_ICON, label: localize(own.label, langs, folderDisplayName(folder)), order: order++ }
  }
  return {
    vault,
    url,
    /** The path the site is served under, "/" or "/garden/" for https://x.dev/garden/. */
    base,
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
    privateLinks: c.privateLinks,
    // A note's path always ends in .md, so `home: bento` names no note.
    home: (typeof c.home === "string" ? (c.home === "bento" ? "index.md" : c.home) : c.home.note).replace(/^\/+/, ""),
    /** The tiles of a bento home, in order; none for the home of the site's style. */
    bento: c.home === "bento" ? { tiles: [...BENTO_TILES] } : typeof c.home === "object" && c.home.layout === "bento" ? { tiles: [...new Set(c.home.tiles)] } : undefined,
    conventions: c.conventions,
    footer: footerGroups(c.footer, navItem, langs),
    poweredBy: c.poweredBy,
    nav: c.nav.map(navItem),
    sidebar: c.sidebar.map(navItem),
    encryption: c.encryption,
    analytics: c.analytics,
    comments: c.comments,
    subscribe: c.subscribe,
    history: c.history,
    cname: c.cname,
    redirects: c.redirects,
    headers: c.headers,
    ogImages: c.ogImages,
    llms: c.llms,
    oembed: c.oembed,
    activitypub: c.activitypub,
    neighbours: Object.fromEntries(Object.entries(c.neighbours).map(([k, v]) => [k, v.replace(/\/+$/, "")])),
    askAi: [...new Set(c.askAi)],
    outdated: c.outdated,
    stats: c.stats,
    offline: c.offline,
    drafts,
    map: c.map,
    glossary: c.glossary,
    archiveDeadLinks: c.archiveDeadLinks,
    check: c.check,
    linkPreviews: c.linkPreviews,
    search: c.search,
    bibliography: (typeof c.bibliography === "string" ? [c.bibliography] : (c.bibliography ?? [])).map((p) => p.replace(/^\/+/, "")),
    images: { ...c.images, widths: [...new Set(c.images.widths)].sort((a, b) => a - b) },
    stackedPages: c.stackedPages,
    topics: c.topics,
    graph: c.graph,
    related: c.related,
    tts: c.tts satisfies TtsConfig | undefined,
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
      folders: Object.fromEntries(Object.entries(c.appearance.folders).map(([p, style]) => [p.replace(/^\/+|\/+$/g, ""), style])),
      // Written as in a note's tags: `#poem`, `Poem` and `poem` are the same tag.
      tags: Object.fromEntries(Object.entries(c.appearance.tags).map(([tag, style]): [string, StyleName] => [slugTag(tag.replace(/^#/, "")), style]).filter(([tag]) => tag)),
      stages: c.appearance.stages,
      // Keyed by every language that has one, a full tag winning over its base.
      languages: Object.fromEntries(
        langs.flatMap((l): [Lang, StyleName][] => {
          const style = c.appearance.languages[l] ?? c.appearance.languages[l.split("-")[0]]
          return style ? [[l, style]] : []
        }),
      ),
      schedule: c.appearance.schedule,
      stream: c.appearance.stream.map((p) => p.replace(/^\/+|\/+$/g, "")),
      seasons: seasonsOf(c.appearance.seasons),
      readerSwitch: (readerSwitch === true ? styleNames.filter((st) => !PAGE_STYLES.includes(baseOf(st)) && !SHAPED_STYLES.includes(baseOf(st))) : [...new Set(readerSwitch || [])]).filter((st) => !templated(st)),
    },
    strings: c.strings,
    /** Every style the site knows: the built-in ones, then those of its theme pack. */
    styles: styleNames,
    /**
     * The theme pack of `theme.preset`: its folder, stylesheets and templates for every page, styles and own fonts,
     * the file its warnings point at, and whether it gives the site its accent.
     */
    pack: packed.pack && { ...packed.pack, styles: packStyles },
    /** Problems of the config that do not stop the build, reported by `datme check`. */
    warnings: packed.warnings,
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
      raw = parseYaml(fs.readFileSync(file, "utf8")) ?? {}
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
useSite(site)
