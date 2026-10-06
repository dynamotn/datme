import fs from "node:fs/promises"
import path from "node:path"
import type { APIRoute, GetStaticPaths } from "astro"
import { site } from "~/site.config"
import { getVault } from "~/lib/vault"
import { imageSize, renderVariant, variantWidths, VARIANT } from "~/lib/images"

/** Only assets referenced by a published note are ever emitted, with resized copies of images. */
export const getStaticPaths = (async () => {
  const paths: { params: { path: string } }[] = []
  for (const rel of getVault().assets) {
    paths.push({ params: { path: rel } })
    const size = await imageSize(rel)
    for (const w of size ? variantWidths(size.width) : []) paths.push({ params: { path: `${rel}.w${w}.webp` } })
  }
  return paths
}) satisfies GetStaticPaths

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
  const variant = rel.match(VARIANT)
  if (variant) {
    const original = rel.slice(0, -variant[0].length)
    const size = getVault().assets.has(original) ? await imageSize(original) : undefined
    const width = Number(variant[1])
    if (!size || !variantWidths(size.width).includes(width)) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(await renderVariant(original, width)), { headers: { "content-type": "image/webp" } })
  }
  if (!getVault().assets.has(rel)) return new Response(null, { status: 404 })
  const data = await fs.readFile(path.join(site.vault, rel))
  return new Response(data, {
    headers: { "content-type": TYPES[path.extname(rel).toLowerCase()] ?? "application/octet-stream" },
  })
}
