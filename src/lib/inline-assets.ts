/**
 * Files of encrypted content travel inside the ciphertext: an image used only
 * by a locked part or a protected note becomes a data URI there, so it is never
 * published as a file anyone could fetch.
 */
import fs from "node:fs"
import path from "node:path"

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  pdf: "application/pdf",
}

export const mediaType = (rel: string) => TYPES[path.extname(rel).slice(1).toLowerCase()] ?? "application/octet-stream"

/**
 * Replace `/assets/…` URLs of `html` that are not public with data URIs of the
 * vault's files; resized copies of those images do not exist, so their srcset
 * goes. Returns the vault files that were inlined.
 */
export function inlineAssets(html: string, vault: string, isPublic: (rel: string) => boolean): { html: string; inlined: string[] } {
  const inlined = new Set<string>()
  const out = html.replace(/\b(src|href)="\/assets\/([^"]+)"/g, (m, attr: string, url: string) => {
    let rel: string
    try {
      rel = url.split("/").map(decodeURIComponent).join("/")
    } catch {
      return m
    }
    if (isPublic(rel)) return m
    let data: Buffer
    try {
      data = fs.readFileSync(path.join(vault, rel))
    } catch {
      return m
    }
    inlined.add(rel)
    return `${attr}="data:${mediaType(rel)};base64,${data.toString("base64")}"`
  })
  // The resized copies of an inlined image are not published either.
  const cleaned = out.replace(/<img\b[^>]*\bsrc="data:[^>]*>/g, (tag) => tag.replace(/\s(srcset|sizes)="[^"]*"/g, ""))
  return { html: cleaned, inlined: [...inlined] }
}
