import type { APIRoute, GetStaticPaths } from "astro"
import { site } from "~/site.config"
import { manifest, serviceWorker } from "~/lib/pwa"
import { renderIcon } from "~/lib/og"

// Every build gets its own service worker, so browsers fetch the new assets.
const VERSION = Date.now().toString(36)

const FILES: Record<string, () => Promise<Response>> = {
  "manifest.webmanifest": async () => new Response(manifest(), { headers: { "content-type": "application/manifest+json" } }),
  "sw.js": async () => new Response(serviceWorker(VERSION), { headers: { "content-type": "text/javascript; charset=utf-8" } }),
  "icon-192.png": async () => new Response(new Uint8Array(await renderIcon(site.logo, 192)), { headers: { "content-type": "image/png" } }),
  "icon-512.png": async () => new Response(new Uint8Array(await renderIcon(site.logo, 512)), { headers: { "content-type": "image/png" } }),
}

/** The installable app and offline reading, only when `offline` is on. */
export const getStaticPaths = (() => (site.offline ? Object.keys(FILES).map((pwa) => ({ params: { pwa } })) : [])) satisfies GetStaticPaths

export const GET: APIRoute = ({ params }) => FILES[params.pwa!]()
