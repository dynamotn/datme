import type { SiteConfig } from "../site.config"

/**
 * Which keys of the resolved config salt the render cache: "salt" when the key
 * can reach anything cached (a note's HTML, a diagram, an image, an embedding,
 * a link preview), "skip" when it only shapes the frame around a note or files
 * that are never cached. Social cards key themselves by the card and its style,
 * so the site title, logo, accent and style they show need no salt.
 *
 * Every key is listed, at the top and inside each object of datme's own keys,
 * so the type checker and tests/cache-salt.test.ts fail on a key nobody placed.
 * When in doubt a key is salted: a stale page is worse than a slow build.
 */
type Rule = "salt" | "skip"
/** Every key of an object datme defines, optional ones included. */
type Split<T> = { [K in keyof NonNullable<T>]-?: Rule }

export const SALT_KEYS = {
  // Where images, diagrams and files of the vault are read from.
  vault: "salt",
  // Links and asset paths are written under the base, and absolute ones on the URL; --site sets both.
  url: "salt",
  base: "salt",
  // The social card shows these, and its own key holds the card.
  title: "skip",
  tagline: "skip",
  logo: "skip",
  author: "skip",
  me: "skip",
  fediverse: "skip",
  webmentions: { domain: "skip" } satisfies Split<SiteConfig["webmentions"]>,
  // The notes of each language, the language prefix of links, and the texts rendering writes (`strings`).
  defaultLang: "salt",
  langs: "salt",
  strings: "salt",
  // Which notes exist and are published, and so what a link or an embed turns into.
  ignore: "salt",
  publish: "salt",
  drafts: "salt",
  home: "salt",
  privateLinks: "salt",
  neighbours: "salt",
  // Read while the vault is loaded, into what notes render: stage labels, kinds of note, line breaks, citations, note styles.
  stages: "salt",
  conventions: "salt",
  lineBreaks: "salt",
  bibliography: "salt",
  styles: "salt",
  // Read by the rendering itself: dead links, link cards, the glossary, map tiles, image sizes.
  archiveDeadLinks: "salt",
  linkPreviews: "salt",
  glossary: "salt",
  map: "salt",
  images: "salt",
  // Locked parts are sealed after the cache today; salted in case a cached part ever holds a form.
  encryption: "salt",
  theme: {
    // Code blocks and D2 diagrams are drawn at build time; the merged theme pack shows up here too.
    code: "salt",
    d2: "salt",
    preset: "salt",
    // Mermaid and giscus draw in the browser; the rest is the stylesheet of the page.
    mermaid: "skip",
    comments: "skip",
    scheme: "skip",
    accent: "skip",
    fonts: "skip",
    css: "skip",
  } satisfies Split<SiteConfig["theme"]>,
  // The frame of a page and the pages around the notes.
  bento: { tiles: "skip" } satisfies Split<SiteConfig["bento"]>,
  nav: "skip",
  sidebar: "skip",
  footer: "skip",
  poweredBy: "skip",
  analytics: "skip",
  comments: "skip",
  subscribe: "skip",
  history: "skip",
  outdated: { after: "skip" } satisfies Split<SiteConfig["outdated"]>,
  stackedPages: "skip",
  offline: "skip",
  types: "skip",
  properties: { hide: "skip", show: "skip" } satisfies Split<SiteConfig["properties"]>,
  appearance: {
    style: "skip",
    classic: "skip",
    folders: "skip",
    tags: "skip",
    stages: "skip",
    languages: "skip",
    schedule: "skip",
    stream: "skip",
    seasons: "skip",
    readerSwitch: "skip",
  } satisfies Split<SiteConfig["appearance"]>,
  pack: {
    dir: "skip",
    css: "skip",
    fonts: "skip",
    file: "skip",
    accent: "skip",
    templates: "skip",
    styles: "skip",
  } satisfies Split<SiteConfig["pack"]>,
  warnings: "skip",
  // Files written beside the pages.
  cname: "skip",
  redirects: "skip",
  headers: { csp: "skip" } satisfies Split<Exclude<SiteConfig["headers"], false>>,
  ogImages: "skip",
  llms: "skip",
  oembed: "skip",
  activitypub: "skip",
  askAi: "skip",
  // Pages and data built from the notes, never cached: related notes take their vectors from the cache by model.
  related: { count: "skip", mentions: "skip", semantic: "skip" } satisfies Split<SiteConfig["related"]>,
  topics: "skip",
  graph: { depth: "skip", view: "skip" } satisfies Split<SiteConfig["graph"]>,
  search: { engine: "skip", meaning: "skip" } satisfies Split<SiteConfig["search"]>,
  stats: { hide: "skip" } satisfies Split<SiteConfig["stats"]>,
  check: { structure: "skip", layouts: "skip", passwords: "skip" } satisfies Split<SiteConfig["check"]>,
  // Audio has its own cache, keyed by the text and the voice.
  tts: { models: "skip", folders: "skip", frontmatter: "skip" } satisfies Split<SiteConfig["tts"]>,
} satisfies { [K in keyof SiteConfig]-?: Rule | Record<string, Rule> }

/** The salted part of a config, as a string: the same for any two configs that render notes alike. */
export function configSalt(site: SiteConfig): string {
  const config = site as unknown as Record<string, unknown>
  const kept: Record<string, unknown> = {}
  for (const [key, rule] of Object.entries(SALT_KEYS)) {
    if (rule === "salt") kept[key] = config[key]
    else if (rule !== "skip") {
      const value = config[key] as Record<string, unknown>
      kept[key] = Object.fromEntries(Object.entries(rule).flatMap(([k, r]) => (r === "salt" ? [[k, value[k]]] : [])))
    }
  }
  return JSON.stringify(kept)
}
