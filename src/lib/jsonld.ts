import { site, type Lang } from "../site.config"
import { getVault, type Note } from "./vault"
import { t, langPrefix } from "./i18n"
import { slugToUrl } from "./slug"

/** Structured data for search engines, as schema.org objects. */
export type JsonLd = Record<string, unknown>

/** Absolute URL of a site path; JSON-LD is only emitted when site.url is known. */
const abs = (p: string) => new URL(p, site.url + "/").href

const author = () => (site.author ? { "@type": "Person", name: site.author } : undefined)

/** The site itself, on the home page of each language. */
export function websiteLd(lang: Lang): JsonLd[] {
  if (!site.url) return []
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: site.title[lang],
      description: site.tagline[lang] || undefined,
      url: abs(slugToUrl(langPrefix(lang) + "index")),
      inLanguage: lang,
      author: author(),
    },
  ]
}

interface NoteLdOpts {
  title: string
  description?: string
  image?: string
  words: number
}

/** A note as an Article (BlogPosting for blog notes), with the folders above it as breadcrumbs. */
export function noteLd(note: Note, { title, description, image, words }: NoteLdOpts): JsonLd[] {
  if (!site.url) return []
  const url = abs(note.url)
  const folders = getVault().folders[note.lang]
  const parts = note.dir ? note.dir.split("/") : []
  const crumbs = [
    { name: t(note.lang).home, url: abs(slugToUrl(langPrefix(note.lang) + "index")) },
    ...parts
      .map((_, i) => folders.get(parts.slice(0, i + 1).join("/")))
      .filter((f) => f != null)
      .map((f) => ({ name: f.name, url: abs(f.url) })),
    { name: title, url },
  ]
  return [
    {
      "@context": "https://schema.org",
      "@type": note.isBlog ? "BlogPosting" : "Article",
      // Google truncates longer headlines.
      headline: title.length > 110 ? title.slice(0, 109) + "…" : title,
      description: description || undefined,
      url,
      mainEntityOfPage: url,
      image: image ? abs(image) : undefined,
      datePublished: note.created?.toISOString(),
      dateModified: (note.updated ?? note.created)?.toISOString(),
      inLanguage: note.lang,
      keywords: note.tags.length ? note.tags.join(", ") : undefined,
      wordCount: words || undefined,
      author: author(),
      isAccessibleForFree: !note.protected,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
    },
  ]
}

/** JSON for a <script type="application/ld+json">, safe against an early </script>. */
export function serializeLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
