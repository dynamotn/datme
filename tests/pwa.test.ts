import { describe, expect, test } from "bun:test"
import { manifest, serviceWorker } from "../src/lib/pwa"
import { renderIcon } from "../src/lib/og"

describe("installable site", () => {
  test("the manifest names the site in its default language and lists its icons", () => {
    const m = JSON.parse(manifest())
    expect(m).toMatchObject({ name: "Khu vườn thử nghiệm", lang: "vi-VN", start_url: "/", display: "standalone" })
    expect(m.icons.map((i: { src: string }) => i.src)).toEqual(["/favicon.svg", "/icon-192.png", "/icon-512.png", "/icon-512.png"])
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

  test("precaches the home page and search index of every language", () => {
    const precache = JSON.parse(sw.match(/const PRECACHE = (.*)/)![1])
    expect(precache).toEqual(["/", "/en-US", "/static/contentIndex.vi-VN.json", "/static/contentIndex.en-US.json"])
  })

  test("caches are versioned per build, except the pages read offline", () => {
    expect(sw).toContain('const VERSION = "v1"')
    expect(sw).toContain('const PAGES = "datme-pages"')
    expect(sw).toContain("Bạn đang ngoại tuyến")
  })
})
