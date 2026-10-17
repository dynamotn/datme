import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { indexResponse, noteIndex } from "~/lib/note-index"

export const getStaticPaths = (() => site.langs.map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths

/** Graph, walk and random-note data for one language: the content index without the notes' text. */
export const GET: APIRoute = async ({ params }) => indexResponse(await noteIndex(params.lang as Lang, false))
