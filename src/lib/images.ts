import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { site } from "../site.config"
import { readCache, writeCache } from "./render-cache"

/** Formats worth resizing; GIFs may be animated and SVGs scale on their own. */
export const RASTER = /\.(png|jpe?g|webp|avif)$/i

/** A resized copy sits next to its original: x.png → x.png.w960.webp. */
export const VARIANT = /\.w(\d+)\.webp$/

export interface ImageSize {
  width: number
  height: number
}

/** Size and modification stamp of an asset, keying everything derived from it. */
export function stamp(rel: string): string {
  try {
    const st = fs.statSync(path.join(site.vault, rel))
    return `${st.size}:${Math.round(st.mtimeMs)}`
  } catch {
    return "missing"
  }
}

const sizes = new Map<string, Promise<ImageSize | undefined>>()

/** Pixel size of a raster asset of the vault, or undefined for anything else. */
export function imageSize(rel: string): Promise<ImageSize | undefined> {
  if (!RASTER.test(rel)) return Promise.resolve(undefined)
  let hit = sizes.get(rel)
  if (!hit) {
    hit = (async () => {
      const key = [rel, stamp(rel)]
      const cached = readCache("img-size", import.meta.url, key)
      if (cached) return JSON.parse(cached.toString("utf8")) as ImageSize
      try {
        const meta = await sharp(path.join(site.vault, rel)).metadata()
        if (!meta.width || !meta.height) return undefined
        // EXIF orientation 5–8 turns the picture a quarter, swapping its sides.
        const turned = (meta.orientation ?? 1) >= 5
        const size = turned ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height }
        writeCache("img-size", import.meta.url, key, JSON.stringify(size))
        return size
      } catch {
        return undefined
      }
    })()
    sizes.set(rel, hit)
  }
  return hit
}

/** Widths of the resized copies of an image: only those smaller than the original. */
export function variantWidths(width: number): number[] {
  return site.images.optimize ? site.images.widths.filter((w) => w < width) : []
}

/** Site URL of an asset, path segments encoded. */
export function assetPath(rel: string): string {
  return "/assets/" + rel.split("/").map(encodeURIComponent).join("/")
}

export function variantPath(rel: string, width: number): string {
  return `${assetPath(rel)}.w${width}.webp`
}

/** The resized copy as WebP; EXIF orientation is applied, since metadata is dropped. */
export async function renderVariant(rel: string, width: number): Promise<Buffer> {
  const key = [rel, stamp(rel), String(width), String(site.images.quality)]
  const cached = readCache("img", import.meta.url, key)
  if (cached) return cached
  const out = await sharp(path.join(site.vault, rel))
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: site.images.quality })
    .toBuffer()
  writeCache("img", import.meta.url, key, out)
  return out
}

/** Layout width of the reading column, for `sizes`. */
export const SIZES = "(max-width: 50rem) 100vw, 46rem"
