import crypto from "node:crypto"
import type { SiteConfig } from "../site.config"

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
  const style = new Set(["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"])
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
    script.add("https://giscus.app")
    frame.add("https://giscus.app")
  } else if (c?.provider === "commento") {
    const host = origin(c.host)
    if (host) for (const set of [script, connect, frame, style]) set.add(host)
  }
  if (site.webmentions) connect.add("https://webmention.io")
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
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${[...connect].join(" ")}`,
    `frame-src ${[...frame].join(" ")}`,
    "media-src 'self' https:",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${[...form].join(" ")}`,
    "frame-ancestors 'self'",
  ].join("; ")
}

/** A _headers file (Netlify, Cloudflare Pages): safe defaults, and long caching for hashed assets. */
export function headersFile(site: SiteConfig, scriptHashes: string[] = []): string {
  const all = [
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "X-Frame-Options: SAMEORIGIN",
    ...(site.headers && site.headers.csp ? [`Content-Security-Policy: ${contentSecurityPolicy(site, scriptHashes)}`] : []),
  ]
  return [
    "/*",
    ...all.map((h) => `  ${h}`),
    "",
    "# File names under /_astro carry a hash of their content.",
    "/_astro/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "# The service worker must update as soon as the site does.",
    "/sw.js",
    "  Cache-Control: no-cache",
    "",
  ].join("\n")
}
