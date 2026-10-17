import { describe, expect, test } from "bun:test"
import { manifest, MAX_ASSETS, serviceWorker, THEME_COLOR } from "../src/lib/pwa"
import { STYLES } from "../src/site.config"
import { renderIcon } from "../src/lib/og"

describe("installable site", () => {
  test("the manifest names the site in its default language and lists its icons", () => {
    const m = JSON.parse(manifest())
    expect(m).toMatchObject({ name: "Khu vườn thử nghiệm", lang: "vi-VN", start_url: "/", display: "standalone" })
    expect(m.icons.map((i: { src: string }) => i.src)).toEqual(["/favicon.svg", "/icon-192.png", "/icon-512.png", "/icon-512.png"])
  })

  test("every style has a theme colour pair", () => {
    expect(Object.keys(THEME_COLOR).sort()).toEqual([...STYLES].sort())
    expect(THEME_COLOR.garden.light).toMatch(/^#[0-9a-f]{6}$/i)
  })

  test("icons are square PNGs of the requested size", async () => {
    const png = await renderIcon("K", 192)
    expect(png.subarray(1, 4).toString()).toBe("PNG")
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([192, 192])
  })
})

describe("service worker", () => {
  const sw = serviceWorker("v1")

  test("is valid JavaScript", () => {
    expect(() => new Function(sw)).not.toThrow()
  })

  test("precaches the home page of every language, not the search index: it holds every note's text", () => {
    const precache = JSON.parse(sw.match(/const PRECACHE = (.*)/)![1])
    expect(precache).toEqual(["/", "/en-US"])
    // Indexes are still kept once fetched, for offline reading.
    expect(sw).toContain('url.pathname.startsWith("/static/")')
  })

  test("caches are versioned per build, except the pages read offline", () => {
    expect(sw).toContain('const VERSION = "v1"')
    expect(sw).toContain('const PAGES = "datme-pages"')
    expect(sw).toContain("Bạn đang ngoại tuyến")
  })

  test("keeps at most MAX_ASSETS build assets, dropping the oldest", async () => {
    // A worker scope of its own: caches in maps, a network that always answers.
    const stores = new Map<string, Map<string, unknown>>()
    const open = async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const m = stores.get(name)!
      const key = (r: { url?: string } | string) => (typeof r === "string" ? r : r.url!)
      return {
        put: async (r: { url: string }, v: unknown) => void m.set(key(r), v),
        keys: async () => [...m.keys()],
        delete: async (k: string) => m.delete(k),
        match: async (r: { url: string }) => m.get(key(r)),
      }
    }
    const caches = { open, match: async (r: { url: string }) => [...stores.values()].find((m) => m.has(r.url))?.get(r.url) }
    const listeners: Record<string, (e: unknown) => void> = {}
    const self = { location: { origin: "https://garden.test" }, addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f) }
    const fetch = async () => ({ ok: true, type: "basic", clone() { return this } })
    new Function("self", "caches", "fetch", sw)(self, caches, fetch)
    for (let i = 0; i < MAX_ASSETS + 25; i++) {
      let answer: Promise<unknown> | undefined
      const url = `https://garden.test/_astro/chunk${i}.js`
      listeners.fetch({ request: { method: "GET", url, mode: "cors", headers: new Headers() }, respondWith: (p: Promise<unknown>) => (answer = p) })
      await answer
      await new Promise((r) => setTimeout(r, 0))
    }
    const assets = stores.get("datme-assets-v1")!
    expect(assets.size).toBe(MAX_ASSETS)
    expect(assets.has("https://garden.test/_astro/chunk0.js")).toBe(false)
    expect(assets.has(`https://garden.test/_astro/chunk${MAX_ASSETS + 24}.js`)).toBe(true)
  })
})
