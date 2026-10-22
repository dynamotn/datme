import crypto from "node:crypto"
import type { SiteConfig } from "../site.config"
import { MONO_FONT_ORIGIN } from "./fonts"
import { STATIC_HEADERS } from "./activitypub"
import { withBase } from "./base"

/** Hashes of the inline scripts of built pages, for a CSP without 'unsafe-inline'. */
export function inlineScriptHashes(pages: string[]): string[] {
  const hashes = new Set<string>()
  for (const html of pages) {
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attrs = m[1]
      // Data blocks such as JSON-LD are not run, and src= scripts are covered by their origin.
      if (/\bsrc=/i.test(attrs) || (/\btype=/i.test(attrs) && !/\btype=["']?(module|text\/javascript)/i.test(attrs))) continue
      if (!m[2].trim()) continue
      hashes.add(`'sha256-${crypto.createHash("sha256").update(m[2]).digest("base64")}'`)
    }
  }
  return [...hashes].sort()
}

const origin = (u: string) => {
  try {
    return new URL(u).origin
  } catch {
    return undefined
  }
}

/** Every outside origin the configured features load from, by CSP directive. */
export function contentSecurityPolicy(site: SiteConfig, scriptHashes: string[]): string {
  const script = new Set(["'self'", ...scriptHashes])
  const connect = new Set(["'self'"])
  const frame = new Set(["https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://platform.twitter.com", "https://syndication.twitter.com"])
  const style = new Set(["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", MONO_FONT_ORIGIN])
  const img = new Set(["'self'", "data:", "https:"])
  // Embedded tweets load their widget script.
  script.add("https://platform.twitter.com")
  const a = site.analytics
  if (a?.provider === "google") {
    script.add("https://www.googletagmanager.com")
    connect.add("https://www.google-analytics.com").add("https://*.google-analytics.com")
  } else if (a?.provider === "plausible") {
    const host = `https://${a.host ?? "plausible.io"}`
    script.add(host)
    connect.add(host)
  } else if (a?.provider === "umami") {
    const host = origin(a.host)
    if (host) {
      script.add(host)
      connect.add(host)
    }
  } else if (a?.provider === "goatcounter") {
    script.add("https://gc.zgo.at")
    connect.add(`https://${a.id}.goatcounter.com`)
  }
  const c = site.comments
  if (c?.provider === "giscus") {
    // The widget script also adds Giscus's own stylesheet to the page.
    for (const set of [script, frame, style]) set.add("https://giscus.app")
  } else if (c?.provider === "commento") {
    const host = origin(c.host)
    if (host) for (const set of [script, connect, frame, style]) set.add(host)
  }
  if (site.webmentions) connect.add("https://webmention.io")
  // Search by meaning runs transformers.js from the CDN, with the model from Hugging Face, in WebAssembly.
  const worker = new Set(["'self'"])
  if (site.search.meaning) {
    script.add("https://cdn.jsdelivr.net").add("'wasm-unsafe-eval'")
    connect.add("https://cdn.jsdelivr.net").add("https://huggingface.co").add("https://*.huggingface.co").add("https://*.hf.co")
    worker.add("blob:")
  }
  const form = new Set(["'self'"])
  const sub = site.subscribe
  if (sub?.provider === "buttondown") form.add("https://buttondown.com")
  else if (sub?.provider === "form") {
    const host = origin(sub.action)
    if (host) form.add(host)
  }
  return [
    "default-src 'self'",
    `script-src ${[...script].join(" ")}`,
    `style-src ${[...style].join(" ")}`,
    `img-src ${[...img].join(" ")}`,
    `font-src 'self' data: https://fonts.gstatic.com ${MONO_FONT_ORIGIN}`,
    `connect-src ${[...connect].join(" ")}`,
    `frame-src ${[...frame].join(" ")}`,
    "media-src 'self' https:",
    `worker-src ${[...worker].join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${[...form].join(" ")}`,
    "frame-ancestors 'self'",
  ].join("; ")
}

/** Extensions of vault files that a browser opened on their own would run scripts in. */
const INERT_FILES = ["svg", "html", "htm", "xml", "xhtml"]
/** No scripts, no outside loads, a unique origin: what such a file gets when opened directly. */
const INERT_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"

/** A _headers file (Netlify, Cloudflare Pages): safe defaults, and long caching for hashed assets. */
export function headersFile(site: SiteConfig, scriptHashes: string[] = []): string {
  // Paths of the site's own files, under the path it is served from.
  const at = (path: string) => withBase(path, site.base)
  const all = [
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "X-Frame-Options: SAMEORIGIN",
    // A site served over HTTPS stays on it; a host that serves only HTTP ignores the header.
    ...(site.url?.startsWith("https://") ? ["Strict-Transport-Security: max-age=31536000"] : []),
    // biome-ignore lint/complexity/useOptionalChain: headers may be `false`, which `?.` does not narrow
    ...(site.headers && site.headers.csp ? [`Content-Security-Policy: ${contentSecurityPolicy(site, scriptHashes)}`] : []),
  ]
  return [
    at("/*"),
    ...all.map((h) => `  ${h}`),
    "",
    "# Vault files a browser would run as a page (an SVG or HTML with a script) open inert.",
    "# Pages that show them as pictures or frames are not affected; PDFs and media are left alone.",
    ...INERT_FILES.flatMap((ext) => [at(`/assets/*.${ext}`), `  Content-Security-Policy: ${INERT_CSP}`, ""]),
    "# File names under /_astro carry a hash of their content.",
    at("/_astro/*"),
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    ...(site.oembed && site.url
      ? [
          "# Note cards are made to be embedded by other sites; frame-ancestors overrides X-Frame-Options.",
          at("/*/embed"),
          "  Content-Security-Policy: frame-ancestors *",
          "",
        ]
      : []),
    ...(site.activitypub && site.activitypub !== "bridgy" ? ["# The fediverse reads these as JSON from other servers.", ...STATIC_HEADERS] : []),
    "# The service worker must update as soon as the site does.",
    at("/sw.js"),
    "  Cache-Control: no-cache",
    "",
  ].join("\n")
}
