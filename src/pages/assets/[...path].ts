import fs from "node:fs/promises"
import path from "node:path"
import type { APIRoute, GetStaticPaths } from "astro"
import { site } from "~/site.config"
import { getVault } from "~/lib/vault"

/** Only assets referenced by a published note are ever emitted. */
export const getStaticPaths = (() =>
  [...getVault().assets].map((rel) => ({ params: { path: rel } }))) satisfies GetStaticPaths

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
}

export const GET: APIRoute = async ({ params }) => {
  const rel = String(params.path)
  if (!getVault().assets.has(rel)) return new Response(null, { status: 404 })
  const data = await fs.readFile(path.join(site.vault, rel))
  return new Response(data, {
    headers: { "content-type": TYPES[path.extname(rel).toLowerCase()] ?? "application/octet-stream" },
  })
}
