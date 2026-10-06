import { site } from "../site.config"
import { t, langPrefix } from "./i18n"
import { slugToUrl } from "./slug"

/** Theme colours of the browser chrome, matching the light page background. */
export const THEME_COLOR = { notebook: "#f5f5f0", classic: "#f6f3ec" } as const

/** The web app manifest: lets readers install the garden and open it like an app. */
export function manifest(): string {
  const lang = site.defaultLang
  const color = THEME_COLOR[site.appearance.style]
  return JSON.stringify(
    {
      name: site.title[lang],
      short_name: site.title[lang].length > 12 ? site.logo : site.title[lang],
      description: site.tagline[lang] || undefined,
      lang,
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: color,
      theme_color: color,
      icons: [
        { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  )
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Shown for a page that was never read while online. */
function offlinePage(): string {
  const lang = site.defaultLang
  const lines = site.langs.map((l) => `<p>${escapeHtml(t(l).offlineLead)}</p>`).join("")
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(t(lang).offline)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;text-align:center;color:#1d1b17;background:#f6f3ec}@media(prefers-color-scheme:dark){body{color:#ecebe5;background:#111210}}a{color:inherit}</style></head><body><p style="font-size:48px;margin:0">📴</p><h1>${escapeHtml(t(lang).offline)}</h1>${lines}<p><a href="/">${escapeHtml(t(lang).backHome)}</a></p></body></html>`
}

/** Pages kept for offline reading; the oldest ones are dropped beyond this. */
const MAX_PAGES = 100

/**
 * The service worker. Pages are network-first, so readers always get the
 * latest version online and the pages they already read offline; hashed
 * build assets are cache-first. A new build gets a new version, which drops
 * the caches of the previous one, except the pages.
 */
export function serviceWorker(version: string): string {
  const precache = [...site.langs.map((l) => slugToUrl(langPrefix(l) + "index")), ...site.langs.map((l) => `/static/contentIndex.${l}.json`)]
  return `// datme service worker, build ${version}
const VERSION = ${JSON.stringify(version)}
const CORE = "datme-core-" + VERSION
const ASSETS = "datme-assets-" + VERSION
const PAGES = "datme-pages"
const PRECACHE = ${JSON.stringify(precache)}
const OFFLINE = ${JSON.stringify(offlinePage())}
const MAX_PAGES = ${MAX_PAGES}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CORE)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("datme-") && k !== CORE && k !== ASSETS && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim() {
  const cache = await caches.open(PAGES)
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_PAGES)).map((k) => cache.delete(k)))
}

async function page(request) {
  const url = new URL(request.url)
  url.search = ""
  url.hash = ""
  const key = url.href.replace(/\\/$/, "") || url.href
  try {
    const response = await fetch(request)
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(PAGES)
      await cache.delete(key)
      await cache.put(key, response.clone())
      trim()
    }
    return response
  } catch {
    const cached = (await caches.match(key)) ?? (await caches.match(url.pathname, { cacheName: CORE }))
    return cached ?? new Response(OFFLINE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } })
  }
}

async function asset(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && response.type === "basic") (await caches.open(ASSETS)).put(request, response.clone())
  return response
}

async function fresh(request) {
  const cache = await caches.open(CORE)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return (await cache.match(request)) ?? (await network) ?? Response.error()
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === "/sw.js") return
  // Client-side navigations fetch the next page as HTML rather than navigating.
  if (request.mode === "navigate" || (request.headers.get("accept") ?? "").includes("text/html")) {
    event.respondWith(page(request))
  } else if (url.pathname.startsWith("/_astro/")) {
    event.respondWith(asset(request))
  } else if (url.pathname.startsWith("/static/") || url.pathname.startsWith("/assets/")) {
    event.respondWith(fresh(request))
  }
})
`
}
