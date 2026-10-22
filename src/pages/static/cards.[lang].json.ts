import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { decks, hasDecks } from "~/lib/decks"
import { renderNote } from "~/lib/markdown"

export const getStaticPaths = (() => site.langs.filter(hasDecks).map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths

/**
 * Every deck of a language for /practice: its page, title, tags and HTML.
 * The browser finds the cards in the HTML as a deck's own page does, so
 * their ids, and the reader's progress, are the same on both.
 */
export const GET: APIRoute = async ({ params }) => {
  const list = await Promise.all(decks(params.lang as Lang).map(async (n) => ({ u: n.url, t: n.title, g: n.tags, h: (await renderNote(n)).html })))
  return new Response(JSON.stringify({ decks: list }), { headers: { "content-type": "application/json; charset=utf-8" } })
}
