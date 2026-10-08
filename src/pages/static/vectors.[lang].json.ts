import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { noteVectors } from "~/lib/vectors"

// Only with related.semantic: the vectors are the ones it computes anyway.
export const getStaticPaths = (() => (site.related.semantic ? site.langs.map((lang) => ({ params: { lang } })) : [])) satisfies GetStaticPaths

/** Note vectors of one language, for "notes like this one" and search by meaning. */
export const GET: APIRoute = async ({ params }) => {
  const semantic = site.related.semantic
  if (!semantic) return new Response(null, { status: 404 })
  return new Response(JSON.stringify(await noteVectors(params.lang as Lang, semantic.model)), {
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}
