import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { listed } from "~/lib/vault"
import { graphOf, hoodAt, hoodId } from "~/lib/graph-hoods"

/** One file per listed note: the neighbourhood its local graph draws. */
export const getStaticPaths = (() =>
  site.langs.flatMap((lang) => listed(lang).map((n) => ({ params: { lang, id: hoodId(n.url) }, props: { url: n.url } })))) satisfies GetStaticPaths

export const GET: APIRoute<{ url: string }> = async ({ params, props }) => {
  const hood = hoodAt(await graphOf(params.lang as Lang), props.url)
  if (!hood) return new Response(null, { status: 404 })
  return new Response(JSON.stringify(hood), { headers: { "content-type": "application/json; charset=utf-8" } })
}
