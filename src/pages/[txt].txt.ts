import type { GetStaticPaths } from "astro"
import { site } from "~/site.config"
import { llmsTxt } from "~/lib/llms"

/** /llms.txt, unless `llms: false`; robots.txt has a route of its own. */
export const getStaticPaths = (() => (site.llms ? [{ params: { txt: "llms" } }] : [])) satisfies GetStaticPaths

export const GET = async () => new Response(await llmsTxt(), { headers: { "content-type": "text/plain; charset=utf-8" } })
