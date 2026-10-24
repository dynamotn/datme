import dns from "node:dns"
import http, { type IncomingMessage } from "node:http"
import https from "node:https"
import net from "node:net"
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
/** Redirects followed before giving up. */
const MAX_REDIRECTS = 3

/**
 * Addresses of this machine, private networks and everything that is not plainly the public web,
 * which a link in a note must not reach from the build.
 */
const PRIVATE = new net.BlockList()
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  PRIVATE.addSubnet(address, prefix, "ipv4")
for (const [address, prefix] of [
  // Unspecified, loopback and IPv4-compatible (::127.0.0.1).
  ["::", 96],
  // NAT64 and 6to4 carry an IPv4 address the gateway reaches, private ones included; Teredo is a tunnel.
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["2002::", 16],
  ["2001::", 32],
  // Documentation and discard-only.
  ["2001:db8::", 32],
  ["100::", 64],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const)
  PRIVATE.addSubnet(address, prefix, "ipv6")

// IPv4 rules also cover IPv4-mapped IPv6 addresses (::ffff:127.0.0.1).
const isPrivate = (ip: string) => PRIVATE.check(ip, net.isIPv6(ip) ? "ipv6" : "ipv4")

interface Address {
  address: string
  family: number
}

/**
 * The address the build may connect to for a URL: on the web, and not on this machine or a private
 * network, whatever its name resolves to. Every address of the name must be public, and a name that
 * does not resolve is refused. The name is resolved once: the connection goes to this address, so a
 * name answering a private address on the next lookup (DNS rebinding) never gets one.
 */
async function publicAddress(url: URL): Promise<Address | undefined> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase()
  if (host === "localhost" || host.endsWith(".localhost")) return undefined
  const family = net.isIP(host)
  let addresses: Address[]
  try {
    addresses = family ? [{ address: host, family }] : await dns.promises.lookup(host, { all: true })
  } catch {
    return undefined
  }
  return addresses.length > 0 && addresses.every((a) => !isPrivate(a.address)) ? addresses[0] : undefined
}

/**
 * The response at a URL, asked of the given address. `node:http` takes the address through `lookup`
 * in Node and Bun alike, while the Host header and the TLS name and certificate check stay the URL's.
 * No agent: a connection kept from another request is never reused.
 */
function request(url: URL, to: Address, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        agent: false,
        signal,
        headers: { "user-agent": "datme-link-preview (+https://gitlab.com/dynamo-brain/datme)", accept: "text/html" },
        lookup: (_host, options, done) => (options.all ? done(null, [to]) : done(null, to.address, to.family)),
      },
      resolve,
    )
    req.on("error", reject)
    req.end()
  })
}

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

/** The response at a URL, following redirects by hand so each address is checked before it is asked. */
async function fetchChecked(url: string, timeoutMs: number): Promise<IncomingMessage | undefined> {
  const signal = AbortSignal.timeout(timeoutMs)
  let target = new URL(url)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const to = await publicAddress(target)
    if (!to) return undefined
    const res = await request(target, to, signal)
    const status = res.statusCode ?? 0
    const location = status >= 300 && status < 400 ? res.headers.location : undefined
    if (!location) return res
    res.destroy()
    // A redirect past the last one allowed is not followed.
    if (hop < MAX_REDIRECTS) target = new URL(location, target)
  }
  return undefined
}

async function fetchHead(url: string, timeoutMs: number): Promise<string | undefined> {
  const res = await fetchChecked(url, timeoutMs)
  if (!res) return undefined
  const status = res.statusCode ?? 0
  if (status < 200 || status >= 300 || !(res.headers["content-type"] ?? "").includes("html")) {
    res.destroy()
    return undefined
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of res as AsyncIterable<Buffer>) {
    chunks.push(chunk)
    size += chunk.length
    // The head is enough; stop once it has ended.
    if (size >= MAX_BYTES || chunk.toString("utf8").includes("</head>")) break
  }
  res.destroy()
  return Buffer.concat(chunks).toString("utf8")
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
      ...(p.description
        ? [{ type: "element", tagName: "span", properties: { className: ["link-card-desc"] }, children: [text(p.description)] } as Element]
        : []),
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
