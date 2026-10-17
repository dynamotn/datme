/**
 * oEmbed: other sites embed a card of a note, the way they embed a video.
 * Each public note gets a JSON description next to it and a small card page
 * at <note>/embed, the iframe the JSON points to. Both need site.url.
 */
import { site } from "../site.config"
import type { Note } from "./vault"
import { renderNote } from "./markdown"
import { ogPath } from "./og-url"

/** Height of the card in pixels, as the iframe asks for it. */
export const EMBED_HEIGHT = 190

/** Whether other sites may embed a note: public, listed, not the home page. */
export const embeddable = (n: Note) => site.oembed && !!site.url && !n.unlisted && !n.protected && !n.isHome && !n.draft

export const embedUrl = (n: Note) => `${n.url.replace(/\/$/, "")}/embed`
export const oembedUrl = (n: Note) => `${n.url.replace(/\/$/, "")}.oembed.json`

const abs = (p: string) => new URL(p, site.url + "/").href

/** The note's image for the card: its banner, else its social card. */
export const cardImage = (n: Note) => n.banner ?? ogPath(n.slug)

/** The oEmbed response of a note (oembed.com, type rich). */
export async function oembedJson(n: Note): Promise<Record<string, unknown>> {
  const r = await renderNote(n)
  const title = r.h1 ?? n.title
  const image = cardImage(n)
  const src = abs(embedUrl(n))
  return {
    version: "1.0",
    type: "rich",
    title,
    ...(site.author ? { author_name: site.author } : {}),
    provider_name: site.title[n.lang],
    provider_url: abs("/"),
    ...(image ? { thumbnail_url: abs(image), thumbnail_width: 1200, thumbnail_height: 630 } : {}),
    width: 600,
    height: EMBED_HEIGHT,
    html: `<iframe src="${src}" width="600" height="${EMBED_HEIGHT}" style="max-width:100%;border:0" loading="lazy" title="${title.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"></iframe>`,
  }
}
