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

  /** The worker in a scope of its own: caches in maps, a network that answers each request with `answer`. */
  function worker(answer: (url: string) => { ok: boolean; type: string; headers?: Headers } = () => ({ ok: true, type: "basic" })) {
    const stores = new Map<string, Map<string, unknown>>()
    const open = async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const m = stores.get(name)!
      const key = (r: { url?: string } | string) => (typeof r === "string" ? r : r.url!)
      return {
        put: async (r: { url: string } | string, v: unknown) => void m.set(key(r), v),
        keys: async () => [...m.keys()],
        delete: async (k: string) => m.delete(k),
        match: async (r: { url: string } | string) => m.get(key(r)),
      }
    }
    const caches = {
      open,
      match: async (r: { url: string } | string) =>
        [...stores.values()].find((m) => m.has(typeof r === "string" ? r : r.url))?.get(typeof r === "string" ? r : r.url),
    }
    const listeners: Record<string, (e: unknown) => void> = {}
    const self = { location: { origin: "https://garden.test" }, addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f) }
    const fetch = async (r: { url: string }) => ({
      headers: new Headers(),
      ...answer(r.url),
      clone() {
        return this
      },
    })
    new Function("self", "caches", "fetch", sw)(self, caches, fetch)
    /** Fetch `path` through the worker, as a page script would; undefined when the worker leaves it to the network. */
    const get = async (path: string, init: { mode?: string; accept?: string } = {}) => {
      let answer: Promise<unknown> | undefined
      const headers = new Headers(init.accept ? { accept: init.accept } : {})
      listeners.fetch({
        request: { method: "GET", url: `https://garden.test${path}`, mode: init.mode ?? "cors", headers },
        respondWith: (p: Promise<unknown>) => (answer = p),
      })
      const response = await answer
      await new Promise((r) => setTimeout(r, 0))
      return response
    }
    return { stores, get }
  }

  test("keeps at most MAX_ASSETS build assets, dropping the oldest", async () => {
    const { stores, get } = worker()
    for (let i = 0; i < MAX_ASSETS + 25; i++) await get(`/_astro/chunk${i}.js`)
    const assets = stores.get("datme-assets-v1")!
    expect(assets.size).toBe(MAX_ASSETS)
    expect(assets.has("https://garden.test/_astro/chunk0.js")).toBe(false)
    expect(assets.has(`https://garden.test/_astro/chunk${MAX_ASSETS + 24}.js`)).toBe(true)
  })
})
