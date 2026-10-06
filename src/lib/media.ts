import { escapeAttr } from "./obsidian"

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i
const VIDEO = /\.(mp4|webm|mov|mkv|ogv|m4v)$/i
const AUDIO = /\.(mp3|wav|ogg|oga|m4a|flac|opus|aac)$/i

/** "90", "1m30s" or "1h2m3s" in seconds. */
export function parseTime(v: string | null): number | undefined {
  if (!v) return undefined
  if (/^\d+$/.test(v)) return Number(v)
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m || !m[0]) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** The video id and start time of a YouTube URL in any of its forms. */
export function youtube(url: URL): { id: string; start?: number } | undefined {
  const host = url.hostname.replace(/^(www\.|m\.)/, "")
  let id: string | undefined
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0]
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v") ?? undefined
    else id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1]
  }
  if (!id || !/^[\w-]{6,20}$/.test(id)) return undefined
  return { id, start: parseTime(url.searchParams.get("t") ?? url.searchParams.get("start")) }
}

/** `alt|640` or `alt|640x360`, as Obsidian sizes embeds. */
function splitAlt(alt: string): { text: string; width?: string; height?: string } {
  const m = alt.match(/^(.*?)\|?\s*(\d+)(?:x(\d+))?$/)
  if (m && (alt.includes("|") || m[1] === "")) return { text: m[1].trim(), width: m[2], height: m[3] }
  return { text: alt }
}

/**
 * HTML for `![alt](https://…)` when the URL is a video page, a tweet or a
 * media file; undefined leaves plain images and other links to markdown.
 */
export function embedExternal(alt: string, href: string): string | undefined {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return undefined
  }
  const { text, width, height } = splitAlt(alt)
  const title = escapeAttr(text || url.hostname)
  const size = width ? ` style="max-width:${width}px${height ? `;aspect-ratio:${width}/${height}` : ""}"` : ""
  // On paper an iframe is an empty box, so print shows the link instead.
  const link = `<a class="media-link" href="${escapeAttr(url.href)}">${title}</a>`
  const frame = (src: string, allow: string) =>
    `<span class="media-embed"${size}><iframe src="${escapeAttr(src)}" title="${title}" loading="lazy" allow="${allow}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>${link}</span>`

  const yt = youtube(url)
  if (yt) {
    return frame(
      `https://www.youtube-nocookie.com/embed/${yt.id}${yt.start ? `?start=${yt.start}` : ""}`,
      "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share",
    )
  }
  const host = url.hostname.replace(/^www\./, "")
  const vimeo = host === "vimeo.com" ? url.pathname.match(/^\/(\d+)/)?.[1] : undefined
  if (vimeo) {
    const t = parseTime(url.hash.match(/t=([\dhms]+)/)?.[1] ?? null)
    return frame(`https://player.vimeo.com/video/${vimeo}${t ? `#t=${t}s` : ""}`, "fullscreen; picture-in-picture")
  }
  const tweet = /^(twitter\.com|x\.com|mobile\.twitter\.com)$/.test(host) ? url.pathname.match(/^\/(\w+)\/status\/(\d+)/) : null
  if (tweet) {
    // twitter.com URLs: the widget script does not recognise x.com yet.
    const canonical = `https://twitter.com/${tweet[1]}/status/${tweet[2]}`
    return `<blockquote class="twitter-tweet" data-dnt="true"><a href="${canonical}">${escapeAttr(text || `@${tweet[1]}`)}</a></blockquote>`
  }
  if (VIDEO.test(url.pathname)) return `<video src="${escapeAttr(url.href)}" controls preload="metadata"${size}></video>`
  if (AUDIO.test(url.pathname)) return `<audio src="${escapeAttr(url.href)}" controls preload="none"></audio>`
  if (width && (IMAGE.test(url.pathname) || !url.pathname.includes("."))) {
    return `<img src="${escapeAttr(url.href)}" alt="${escapeAttr(text)}" width="${width}"${height ? ` height="${height}"` : ""} loading="lazy">`
  }
  return undefined
}
