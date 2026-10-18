import type { APIRoute, GetStaticPaths } from "astro"
import { audioBytes, audioIndex, type Audio } from "~/lib/tts"
import { stripBase } from "~/lib/base"

/** The audio of every selected note, next to its page: /Books/Dune → /Books/Dune.mp3. */
export const getStaticPaths = (async () =>
  [...(await audioIndex())].map(([url, mp3]) => ({
    params: { audio: decodeURI(stripBase(url)).replace(/^\//, "") },
    props: { mp3 },
  }))) satisfies GetStaticPaths

export const GET: APIRoute<{ mp3: Audio }> = ({ props }) => {
  const mp3 = audioBytes(props.mp3)
  // A view of the bytes, not a copy of them.
  return new Response(new Uint8Array(mp3.buffer as ArrayBuffer, mp3.byteOffset, mp3.byteLength), { headers: { "content-type": "audio/mpeg" } })
}
