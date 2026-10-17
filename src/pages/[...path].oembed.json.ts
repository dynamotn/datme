import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { listed, type Note } from "~/lib/vault"
import { embeddable, oembedJson, oembedUrl } from "~/lib/oembed"

/** The oEmbed JSON of every public note, next to its page: /Books/Dune → /Books/Dune.oembed.json. */
export const getStaticPaths = (() =>
  site.langs.flatMap((lang: Lang) =>
    listed(lang)
      .filter(embeddable)
      .map((note) => ({ params: { path: decodeURI(oembedUrl(note)).replace(/^\//, "").replace(/\.oembed\.json$/, "") }, props: { note } })),
  )) satisfies GetStaticPaths

export const GET: APIRoute<{ note: Note }> = async ({ props }) =>
  new Response(JSON.stringify(await oembedJson(props.note)), { headers: { "content-type": "application/json+oembed; charset=utf-8" } })
