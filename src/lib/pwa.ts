import { site, type Style } from "../site.config"
import { t, langPrefix } from "./i18n"
import { slugToUrl } from "./slug"
import { withBase } from "./base"
import { escapeText } from "./html"

/** Theme colours of the browser chrome, matching the light page background. */
export const THEME_COLOR: Record<Style, { light: string; dark: string }> = {
  notebook: { light: "#f5f5f0", dark: "#121211" },
  classic: { light: "#f6f3ec", dark: "#111210" },
  garden: { light: "#f7f3e8", dark: "#121a14" },
  resume: { light: "#e9e7e2", dark: "#1b1c1e" },
  darkroom: { light: "#f4f2ee", dark: "#0b0b0b" },
  terminal: { light: "#f3f1e7", dark: "#090c09" },
  blueprint: { light: "#f7fafd", dark: "#0e3a72" },
  wiki: { light: "#f8f9fa", dark: "#101418" },
  broadsheet: { light: "#f4f1ea", dark: "#141311" },
  herbarium: { light: "#e7e0cd", dark: "#17150f" },
  manuscript: { light: "#fffff8", dark: "#151412" },
  lacquer: { light: "#f4ecdb", dark: "#120b08" },
}

/** The web app manifest: lets readers install the garden and open it like an app. */
export function manifest(): string {
  const lang = site.defaultLang
  const color = THEME_COLOR[site.appearance.style].light
  return JSON.stringify(
    {
      name: site.title[lang],
      short_name: site.title[lang].length > 12 ? site.logo : site.title[lang],
      description: site.tagline[lang] || undefined,
      lang,
      start_url: withBase("/"),
      scope: withBase("/"),
      display: "standalone",
      background_color: color,
      theme_color: color,
      icons: [
        { src: withBase("/favicon.svg"), sizes: "any", type: "image/svg+xml" },
        { src: withBase("/icon-192.png"), sizes: "192x192", type: "image/png" },
        { src: withBase("/icon-512.png"), sizes: "512x512", type: "image/png" },
        { src: withBase("/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  )
}

/** Shown for a page that was never read while online. */
function offlinePage(): string {
  const lang = site.defaultLang
  const lines = site.langs.map((l) => `<p>${escapeText(t(l).offlineLead)}</p>`).join("")
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(t(lang).offline)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;text-align:center;color:#1d1b17;background:#f6f3ec}@media(prefers-color-scheme:dark){body{color:#ecebe5;background:#111210}}a{color:inherit}</style></head><body><p style="font-size:48px;margin:0">📴</p><h1>${escapeText(t(lang).offline)}</h1>${lines}<p><a href="${withBase("/")}">${escapeText(t(lang).backHome)}</a></p></body></html>`
}

/** Pages kept for offline reading; the oldest ones are dropped beyond this. */
const MAX_PAGES = 100
/** Build assets kept, scripts and styles of the pages read and the media they show; the oldest go beyond this. */
export const MAX_ASSETS = 300

/**
 * The service worker. Pages are network-first, so readers always get the
 * latest version online and the pages they already read offline; hashed
 * build assets are cache-first. A new build gets a new version, which drops
 * the caches of the previous one, except the pages.
 */
export function serviceWorker(version: string): string {
  // Not the search index: every install would download every note's text. Indexes are cached once fetched.
  const precache = site.langs.map((l) => slugToUrl(langPrefix(l) + "index"))
  // Gardens served under paths of one host (project Pages) share its caches: each keeps to its own names.
  const ns = site.base === "/" ? "datme-" : `datme${site.base}`
  return `// datme service worker, build ${version}
const VERSION = ${JSON.stringify(version)}
const CORE = "${ns}core-" + VERSION
const ASSETS = "${ns}assets-" + VERSION
const PAGES = "${ns}pages"
const PRECACHE = ${JSON.stringify(precache)}
const OFFLINE = ${JSON.stringify(offlinePage())}
const MAX_PAGES = ${MAX_PAGES}
const MAX_ASSETS = ${MAX_ASSETS}

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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("${ns}") && k !== CORE && k !== ASSETS && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)))
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
      trim(PAGES, MAX_PAGES)
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
  if (response.ok && response.type === "basic") {
    const copy = response.clone()
    caches
      .open(ASSETS)
      .then((cache) => cache.put(request, copy))
      .then(() => trim(ASSETS, MAX_ASSETS))
      .catch(() => {})
  }
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
  if (url.pathname === "${withBase("/sw.js")}") return
  // Client-side navigations fetch the next page as HTML rather than navigating.
  if (request.mode === "navigate" || (request.headers.get("accept") ?? "").includes("text/html")) {
    event.respondWith(page(request))
  } else if (url.pathname.startsWith("${withBase("/_astro/")}")) {
    event.respondWith(asset(request))
  } else if (url.pathname.startsWith("${withBase("/static/")}") || url.pathname.startsWith("${withBase("/assets/")}")) {
    event.respondWith(fresh(request))
  }
})
`
}
