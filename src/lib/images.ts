import fs from "node:fs"
import path from "node:path"
import sharp, { type FormatEnum, type Metadata } from "sharp"
import { site } from "../site.config"
import { readCache, writeCache } from "./render-cache"
import { withBase } from "./base"

/** Formats worth resizing; GIFs may be animated and SVGs scale on their own. */
export const RASTER = /\.(png|jpe?g|webp|avif)$/i

/** A resized copy sits next to its original: x.png → x.png.w960.webp. */
export const VARIANT = /\.w(\d+)\.webp$/

export interface ImageSize {
  width: number
  height: number
  /** Transparent images get no blurred placeholder: it would show through. */
  alpha?: boolean
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
        const dims = turned ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height }
        const size: ImageSize = { ...dims, alpha: meta.hasAlpha === true }
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
  return withBase("/assets/" + rel.split("/").map(encodeURIComponent).join("/"))
}

export function variantPath(rel: string, width: number): string {
  return `${assetPath(rel)}.w${width}.webp`
}

/**
 * The resized copy as WebP; EXIF orientation is applied, since metadata is dropped.
 * An image that fails to decode (say, a truncated file) is served as its original bytes.
 */
export async function renderVariant(rel: string, width: number): Promise<Buffer> {
  const key = [rel, stamp(rel), String(width), String(site.images.quality)]
  const cached = readCache("img", import.meta.url, key)
  if (cached) return cached
  const file = path.join(site.vault, rel)
  let out: Buffer
  try {
    out = await sharp(file).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: site.images.quality }).toBuffer()
  } catch (e) {
    console.warn(`[datme] could not resize ${rel}, using the original: ${(e as Error).message}`)
    return fs.readFileSync(file)
  }
  writeCache("img", import.meta.url, key, out)
  return out
}

/** Pictures that may carry EXIF, XMP or IPTC: the formats sharp reads, and the HEIC/HEIF phones save. */
const PICTURE = /\.(png|jpe?g|webp|avif|gif|tiff?|heic|heif)$/i

/** Marks of EXIF and XMP in a file sharp cannot read, so they are found without decoding it. */
const METADATA_MARKS = [Buffer.from("Exif\0\0"), Buffer.from("<x:xmpmeta"), Buffer.from("http://ns.adobe.com/xap/1.0/")]

/**
 * The bytes published for an original image: without its EXIF, XMP, IPTC and
 * comments (where a phone keeps the GPS position, the camera and the time),
 * turned upright as its orientation said, and with its colour profile; in the
 * format the file holds, whatever its name says. A picture carrying none of
 * these, any other file, or `images.keepMetadata`, goes out as it is.
 * Metadata that cannot be removed fails the build: it never goes out by accident.
 */
export async function publicOriginal(rel: string): Promise<Buffer> {
  const file = path.join(site.vault, rel)
  if (site.images.keepMetadata || !PICTURE.test(rel)) return fs.readFileSync(file)
  const key = [rel, stamp(rel)]
  const cached = readCache("img-orig", import.meta.url, key)
  if (cached) return cached
  const refuse = (why: string) =>
    new Error(
      `${rel} holds metadata (EXIF, XMP or IPTC, such as where it was taken) that datme could not remove: ${why}. Convert it to JPEG, PNG or WebP, or set images.keepMetadata: true to publish it as it is`,
    )
  let meta: Metadata
  try {
    meta = await sharp(file).metadata()
  } catch (e) {
    const data = fs.readFileSync(file)
    if (METADATA_MARKS.some((mark) => data.includes(mark))) throw refuse((e as Error).message)
    console.warn(`[datme] could not read ${rel} as a picture, so it is published as it is: ${(e as Error).message}`)
    return data
  }
  let out: Buffer
  if (!meta.exif && !meta.xmp && !meta.iptc && !meta.comments?.length) {
    out = fs.readFileSync(file)
  } else {
    try {
      // An animation keeps its frames; a still picture is turned upright, since its orientation goes with the EXIF.
      const animated = (meta.pages ?? 1) > 1
      const image = animated ? sharp(file, { animated }) : sharp(file).rotate()
      out = await image
        .keepIccProfile()
        .toFormat(meta.format as keyof FormatEnum, { quality: 95 })
        .toBuffer()
    } catch (e) {
      throw refuse((e as Error).message)
    }
  }
  writeCache("img-orig", import.meta.url, key, out)
  return out
}

/**
 * A tiny blurred copy of an image as a data URI, shown while the image loads.
 * A few hundred bytes per image; transparent images go without.
 */
export async function placeholder(rel: string): Promise<string | undefined> {
  if (!site.images.placeholders) return undefined
  const size = await imageSize(rel)
  if (!size || size.alpha) return undefined
  const key = [rel, stamp(rel)]
  const cached = readCache("lqip", import.meta.url, key)
  if (cached) return cached.toString("utf8")
  try {
    const tiny = await sharp(path.join(site.vault, rel)).rotate().resize({ width: 16 }).blur(1).webp({ quality: 40 }).toBuffer()
    const uri = `data:image/webp;base64,${tiny.toString("base64")}`
    writeCache("lqip", import.meta.url, key, uri)
    return uri
  } catch {
    return undefined
  }
}

/** Layout width of the reading column, for `sizes`. */
export const SIZES = "(max-width: 50rem) 100vw, 46rem"
