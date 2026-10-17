import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { plainNotes, noteMarkdown } from "~/lib/llms"
import type { Note } from "~/lib/vault"
import { stripBase } from "~/lib/base"

/** The markdown copy of every public note, next to its page: /Books/Dune → /Books/Dune.md. */
export const getStaticPaths = (() =>
  site.llms
    ? site.langs.flatMap((lang: Lang) =>
        plainNotes(lang).map((note) => ({ params: { md: decodeURI(stripBase(note.url)).replace(/^\//, "") }, props: { note } })),
      )
    : []) satisfies GetStaticPaths

export const GET: APIRoute<{ note: Note }> = ({ props }) =>
  new Response(noteMarkdown(props.note), { headers: { "content-type": "text/markdown; charset=utf-8" } })
