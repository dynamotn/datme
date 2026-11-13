/** The schema of datme.yaml, with zod: what an author may write, and its defaults. */
import { z } from "astro/zod"
import { bundledThemes } from "shiki"
import type { PACK_THEME_KEYS } from "./theme-pack"

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

export const localized = z.union([z.string(), z.record(z.string(), z.string())])

// Values that end up inside a <style> element must not be able to close a rule.
// Inside the brackets only numbers and "deg" for a hue, so a colour cannot break out of the CSS it goes into.
const cssColor = z.string().regex(/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\((?:[\d\s.,%/+-]|deg)+\)|[a-zA-Z]+)$/, "expected a CSS colour")
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
export type MenuEntry = z.infer<typeof menuEntries>[number]

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
export const themeFields = {
  /** Colour scheme before the reader picks one with the toggle; auto follows their system. */
  scheme: z.enum(["auto", "light", "dark"]).default("auto"),
  /** Accent colour of links and highlights; one value, or one per colour scheme. */
  accent: z.union([cssColor, z.object({ light: cssColor, dark: cssColor }).strict()]).optional(),
  /** Font families for headings and UI, reading text and code: from Google Fonts, unless a theme pack ships them. */
  fonts: z.object({ heading: fontFamily.optional(), body: fontFamily.optional(), code: fontFamily.optional() }).strict().default({}),
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
export const makeSchema = (styles: readonly [StyleName, ...StyleName[]]) =>
  z
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
          fediverse: z
            .string()
            .regex(/^@[^@\s]+@[^@\s]+$/, "expected @user@host")
            .optional(),
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
        .record(z.string(), z.union([z.string().min(1), z.object({ icon: z.string().min(1).optional(), label: localized.optional() }).strict(), z.null()]))
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
              tiles: z
                .array(z.enum(BENTO_TILES))
                .min(1)
                .default([...BENTO_TILES]),
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
          /** Notices suggesting a layout for notes and folders whose text or properties look like one. */
          layouts: z.boolean().default(true),
          /** Warnings for passwords that are easy to guess, or written in notes of a vault kept in git. */
          passwords: z.boolean().default(true),
        })
        .strict()
        .default({ structure: true, layouts: true, passwords: true }),
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
      outdated: z.object({ after: z.number().positive() }).strict().optional(),
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
      headers: z.union([z.literal(false), z.object({ csp: z.boolean().default(false) }).strict()]).default({ csp: false }),
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
          seasons: z.union([z.boolean(), z.object({ hemisphere: z.enum(["north", "south"]).default("north") }).strict()]).default(false),
          /** Styles readers can pick from the View menu instead of the page's own; true for every site-wide style. */
          readerSwitch: z.union([z.boolean(), z.array(z.enum(styles)).min(1)]).default(false),
        })
        .strict()
        .default({
          style: "notebook",
          classic: [],
          folders: {},
          tags: {},
          stages: {},
          languages: {},
          schedule: [],
          stream: [],
          seasons: false,
          readerSwitch: false,
        }),
      /** Per-language overrides of UI strings, e.g. { en-US: { blog: Posts } }. */
      strings: z.record(z.string(), z.record(z.string(), z.string())).default({}),
    })
    .strict()

export type TtsConfig = { models: Record<string, "vieneu">; folders: string[]; frontmatter: Record<string, string | number | boolean> }

export type RawConfig = z.input<ReturnType<typeof makeSchema>>
