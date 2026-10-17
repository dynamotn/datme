import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { getVault } from "~/lib/vault"
import { explorerTree } from "~/lib/explorer"

export const getStaticPaths = (() => site.langs.map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths

/** The explorer's whole tree of a language, which pages load in place of the part they carry. */
export const GET: APIRoute = ({ params }) =>
  new Response(explorerTree(getVault().trees[params.lang as Lang]), { headers: { "content-type": "text/html; charset=utf-8" } })
