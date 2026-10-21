import fs from "node:fs/promises"
import path from "node:path"
import type { APIRoute, GetStaticPaths } from "astro"
import { site } from "~/site.config"
import { PACK_TYPES, packFiles } from "~/lib/theme-pack"

/** The theme pack's stylesheets, fonts and pictures, as /theme/<path in the pack>; never its other files. */
export const getStaticPaths = (() => (site.pack ? packFiles(site.pack.dir) : []).map((rel) => ({ params: { path: rel } }))) satisfies GetStaticPaths

export const GET: APIRoute = async ({ params }) => {
  const rel = String(params.path)
  if (!site.pack || !packFiles(site.pack.dir).includes(rel)) return new Response(null, { status: 404 })
  const data = await fs.readFile(path.join(site.pack.dir, rel))
  return new Response(new Uint8Array(data), { headers: { "content-type": PACK_TYPES[path.extname(rel).toLowerCase()] } })
}
