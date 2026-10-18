import type { APIRoute, GetStaticPaths } from "astro"
import { audioIndex } from "~/lib/tts"
import { stripBase } from "~/lib/base"

/** The audio of every selected note, next to its page: /Books/Dune → /Books/Dune.mp3. */
export const getStaticPaths = (async () =>
  [...(await audioIndex())].map(([url, mp3]) => ({
    params: { audio: decodeURI(stripBase(url)).replace(/^\//, "") },
    props: { mp3 },
  }))) satisfies GetStaticPaths

export const GET: APIRoute<{ mp3: Buffer }> = ({ props }) =>
  new Response(new Uint8Array(props.mp3), { headers: { "content-type": "audio/mpeg" } })
