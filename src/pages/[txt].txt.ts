import type { APIRoute, GetStaticPaths } from "astro"
import { site } from "~/site.config"
import { llmsFullTxt, llmsTxt } from "~/lib/llms"

/** /llms.txt and /llms-full.txt, unless `llms: false`; robots.txt has a route of its own. */
export const getStaticPaths = (() => (site.llms ? [{ params: { txt: "llms" } }, { params: { txt: "llms-full" } }] : [])) satisfies GetStaticPaths

export const GET: APIRoute = async ({ params }) =>
  new Response(params.txt === "llms-full" ? llmsFullTxt() : await llmsTxt(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
