import rss from "@astrojs/rss"
import { site, type Lang } from "~/site.config"
import { listed, byRecent, getVault, type Note } from "./vault"
import { renderNote } from "./markdown"
import { langPrefix } from "./i18n"
import { sluggify } from "./slug"

/** What a feed covers: the whole site, a folder (with its subfolders) or a tag (with its subtags). */
export type FeedScope = { kind: "site" } | { kind: "folder"; dir: string } | { kind: "tag"; tag: string }

/** Path of a feed, without the leading slash: index.xml, Books/index.xml, tags/book/index.xml. */
export function feedPath(lang: Lang, scope: FeedScope): string {
  const prefix = langPrefix(lang)
  if (scope.kind === "folder") return `${prefix}${sluggify(scope.dir)}/index.xml`
  if (scope.kind === "tag") return `${prefix}tags/${scope.tag}/index.xml`
  return `${prefix}index.xml`
}

function notesOf(lang: Lang, scope: FeedScope): Note[] {
  if (scope.kind === "tag") return getVault().tags[lang].get(scope.tag) ?? []
  const all = listed(lang).filter((n) => !n.isHome)
  if (scope.kind === "folder") return all.filter((n) => n.dir === scope.dir || n.dir.startsWith(scope.dir + "/"))
  return all
}

export async function feed(lang: Lang, scope: FeedScope = { kind: "site" }): Promise<Response> {
  const notes = byRecent(notesOf(lang, scope), "created").slice(0, 40)
  const name =
    scope.kind === "folder"
      ? getVault().folders[lang].get(scope.dir)?.name
      : scope.kind === "tag"
        ? `#${scope.tag}`
        : undefined
  return rss({
    title: name ? `${name} · ${site.title[lang]}` : site.title[lang],
    description: site.tagline[lang],
    // RSS needs absolute links; without site.url they point at the dev server.
    site: site.url ?? "http://localhost:4321",
    customData: `<language>${lang}</language>`,
    items: await Promise.all(
      notes.map(async (n) => {
        const r = await renderNote(n)
        return {
          title: r.h1 ?? n.title,
          link: n.url,
          pubDate: n.created,
          description: r.description,
          categories: n.tags,
        }
      }),
    ),
  })
}
