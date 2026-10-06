import rss from "@astrojs/rss"
import { site, type Lang } from "~/site.config"
import { listed, byRecent } from "./vault"
import { renderNote } from "./markdown"

export async function feed(lang: Lang): Promise<Response> {
  const notes = byRecent(listed(lang).filter((n) => !n.isHome), "created").slice(0, 40)
  return rss({
    title: site.title[lang],
    description: site.tagline[lang],
    site: site.url,
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
