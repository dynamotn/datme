import type { Element } from "hast"
import { readCache, writeCache } from "./render-cache"

export interface Preview {
  title: string
  description?: string
  image?: string
  site?: string
}

/** Reading stops here: the head of a page is all a preview needs. */
const MAX_BYTES = 512 * 1024
/** A failed fetch is tried again after this long. */
const RETRY_AFTER = 7 * 86_400_000

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()

/** OpenGraph and Twitter card metadata of a page, or its <title>. */
export function parsePreview(html: string, url: string): Preview | undefined {
  const meta = new Map<string, string>()
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = (name: string) => tag[0].match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))
    const key = attr("property") ?? attr("name")
    const content = attr("content")
    if (key && content) {
      const k = (key[2] ?? key[3]).toLowerCase()
      if (!meta.has(k)) meta.set(k, decode(content[2] ?? content[3]))
    }
  }
  const title = meta.get("og:title") ?? meta.get("twitter:title") ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "")
  if (!title) return undefined
  const description = meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description")
  let image = meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image")
  try {
    image = image ? new URL(image, url).href : undefined
  } catch {
    image = undefined
  }
  return {
    title: title.slice(0, 200),
    description: description?.slice(0, 300) || undefined,
    image: image && /^https?:/.test(image) ? image : undefined,
    site: meta.get("og:site_name") || new URL(url).hostname.replace(/^www\./, ""),
  }
}

async function fetchHead(url: string, timeoutMs: number): Promise<string | undefined> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "datme-link-preview (+https://gitlab.com/dynamo-tools/datme)", accept: "text/html" },
  })
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) {
    await res.body?.cancel().catch(() => {})
    return undefined
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    // The head is enough; stop once it has ended.
    if (new TextDecoder().decode(value).includes("</head>")) break
  }
  await reader.cancel().catch(() => {})
  return new TextDecoder().decode(Buffer.concat(chunks))
}

const pending = new Map<string, Promise<Preview | undefined>>()

/** The preview of a URL, from the build cache or fetched once per build. */
export function linkPreview(url: string, timeoutMs = 5000): Promise<Preview | undefined> {
  let hit = pending.get(url)
  if (!hit) {
    hit = (async () => {
      const cached = readCache("preview", import.meta.url, [url])
      if (cached) {
        const entry = JSON.parse(cached.toString("utf8")) as { preview?: Preview; failedAt?: number }
        if (entry.preview || Date.now() - (entry.failedAt ?? 0) < RETRY_AFTER) return entry.preview
      }
      let preview: Preview | undefined
      try {
        const html = await fetchHead(url, timeoutMs)
        preview = html ? parsePreview(html, url) : undefined
      } catch {
        preview = undefined
      }
      writeCache("preview", import.meta.url, [url], JSON.stringify(preview ? { preview } : { failedAt: Date.now() }))
      return preview
    })()
    pending.set(url, hit)
  }
  return hit
}

const text = (value: string): Element["children"][number] => ({ type: "text", value })

/** The card replacing a paragraph that holds nothing but a link. */
export function previewCard(url: string, p: Preview): Element {
  const textPart: Element = {
    type: "element",
    tagName: "span",
    properties: { className: ["link-card-text"] },
    children: [
      { type: "element", tagName: "strong", properties: {}, children: [text(p.title)] },
      ...(p.description ? [{ type: "element", tagName: "span", properties: { className: ["link-card-desc"] }, children: [text(p.description)] } as Element] : []),
      { type: "element", tagName: "small", properties: {}, children: [text(p.site ?? new URL(url).hostname)] },
    ],
  }
  return {
    type: "element",
    tagName: "a",
    properties: { className: ["link-card", "external"], href: url, target: "_blank", rel: ["noopener", "noreferrer"] },
    children: [
      textPart,
      ...(p.image
        ? [{ type: "element", tagName: "img", properties: { src: p.image, alt: "", loading: "lazy", referrerPolicy: "no-referrer" }, children: [] } as Element]
        : []),
    ],
  }
}
