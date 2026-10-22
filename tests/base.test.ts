import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { absUrl, basePath, stripBase, useSite, withBase } from "../src/lib/base"
import { slugToUrl, urlToSlug } from "../src/lib/slug"
import { resolveConfig, site, ConfigError } from "../src/site.config"
import { headersFile } from "../src/lib/headers"
import { manifest, serviceWorker } from "../src/lib/pwa"
import { inlineAssets } from "../src/lib/inline-assets"
import { findInGarden } from "../src/lib/neighbours"
import { base as clientBase, withBase as clientWithBase } from "../src/scripts/base"

// A site served under a path, as GitHub and GitLab project Pages serve one.
const garden = resolveConfig({ site: { url: "https://x.dev/garden/" } }, "/v")

afterEach(() => useSite(site))

describe("the path a site is served under", () => {
  test("comes from the path of site.url, with a slash at both ends", () => {
    expect(basePath(undefined)).toBe("/")
    expect(basePath("https://x.dev")).toBe("/")
    expect(basePath("https://x.dev/")).toBe("/")
    expect(basePath("https://x.dev/garden")).toBe("/garden/")
    expect(basePath("https://x.dev/a/b///")).toBe("/a/b/")
    expect(garden.url).toBe("https://x.dev/garden")
    expect(garden.base).toBe("/garden/")
    expect(resolveConfig({}, "/v").base).toBe("/")
    expect(resolveConfig({}, "/v", { DATME_SITE_URL: "https://user.github.io/repo" }).base).toBe("/repo/")
  })

  test("the fediverse needs the root of a host, where /.well-known/ lives", () => {
    expect(() => resolveConfig({ site: { url: "https://x.dev/garden" }, activitypub: "bridgy" }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ site: { url: "https://x.dev/garden" }, activitypub: "bridgy" }, "/v")).toThrow("not under /garden/")
    expect(resolveConfig({ site: { url: "https://x.dev" }, activitypub: "bridgy" }, "/v").activitypub).toBe("bridgy")
  })

  test("withBase puts site paths under it, and leaves other links alone", () => {
    expect(withBase("/static/a.json", "/garden/")).toBe("/garden/static/a.json")
    expect(withBase("/", "/garden/")).toBe("/garden/")
    expect(withBase("/static/a.json", "/")).toBe("/static/a.json")
    for (const other of ["https://y.dev/a", "//cdn.example/a", "a.png", "#top", "mailto:me@x.dev"]) expect(withBase(other, "/garden/")).toBe(other)
  })

  test("stripBase takes it off again", () => {
    expect(stripBase("/garden/a/b", "/garden/")).toBe("/a/b")
    expect(stripBase("/garden/", "/garden/")).toBe("/")
    expect(stripBase("/garden", "/garden/")).toBe("/")
    expect(stripBase("/elsewhere", "/garden/")).toBe("/elsewhere")
    expect(stripBase("/garden/a", "/")).toBe("/garden/a")
  })

  test("absUrl resolves a link of the site against its host, and keeps it without site.url", () => {
    expect(absUrl("/garden/a", garden)).toBe("https://x.dev/garden/a")
    expect(absUrl("icon-512.png", garden)).toBe("https://x.dev/garden/icon-512.png")
    expect(absUrl("/garden/a", {})).toBe("/garden/a")
  })

  test("the helpers follow the site handed to useSite", () => {
    useSite(garden)
    expect(withBase("/sw.js")).toBe("/garden/sw.js")
    expect(stripBase("/garden/sw.js")).toBe("/sw.js")
    expect(absUrl(withBase("/"))).toBe("https://x.dev/garden/")
    expect(slugToUrl("")).toBe("/garden/")
    expect(slugToUrl("index")).toBe("/garden/")
    expect(slugToUrl("en-US/Books/Hoa hồng")).toBe("/garden/en-US/Books/Hoa%20h%E1%BB%93ng")
    expect(urlToSlug("/garden/en-US/Books/Hoa%20h%E1%BB%93ng")).toBe("en-US/Books/Hoa hồng")
    useSite(site)
    expect(slugToUrl("Books/Dune")).toBe("/Books/Dune")
    expect(urlToSlug("/Books/Dune")).toBe("Books/Dune")
  })
})

describe("files of a site under a path", () => {
  test("_headers rules match its own files", () => {
    const rules = headersFile(garden)
      .split("\n")
      .filter((l) => l.startsWith("/"))
    expect(rules).toEqual([
      "/garden/*",
      "/garden/assets/*.svg",
      "/garden/assets/*.html",
      "/garden/assets/*.htm",
      "/garden/assets/*.xml",
      "/garden/assets/*.xhtml",
      "/garden/_astro/*",
      "/garden/*/embed",
      "/garden/sw.js",
    ])
    expect(headersFile(resolveConfig({ site: { url: "https://x.dev" } }, "/v"))).toContain("\n/_astro/*\n")
  })

  test("the app manifest and the service worker keep to its path", () => {
    useSite(garden)
    const saved = { url: site.url, base: site.base }
    Object.assign(site, { url: garden.url, base: garden.base })
    try {
      const m = JSON.parse(manifest())
      expect([m.start_url, m.scope]).toEqual(["/garden/", "/garden/"])
      expect(m.icons.map((i: { src: string }) => i.src)).toEqual([
        "/garden/favicon.svg",
        "/garden/icon-192.png",
        "/garden/icon-512.png",
        "/garden/icon-512.png",
      ])
      const sw = serviceWorker("v1")
      expect(sw).toContain('const PRECACHE = ["/garden/","/garden/en-US"]')
      expect(sw).toContain('url.pathname === "/garden/sw.js"')
      expect(sw).toContain('url.pathname.startsWith("/garden/_astro/")')
      expect(sw).toContain('url.pathname.startsWith("/garden/static/") || url.pathname.startsWith("/garden/assets/")')
      expect(sw).toContain('<a href=\\"/garden/\\">')
      // Its caches are its own: another garden of the host keeps its pages when this one updates.
      expect(sw).toContain('const CORE = "datme/garden/core-" + VERSION')
      expect(sw).toContain('const PAGES = "datme/garden/pages"')
      expect(sw).toContain('k.startsWith("datme/garden/")')
    } finally {
      Object.assign(site, saved)
    }
    const root = serviceWorker("v1")
    expect(root).toContain('const CORE = "datme-core-" + VERSION')
    expect(root).toContain('k.startsWith("datme-")')
  })

  test("private files under its path are inlined as on a site at the root", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-base-"))
    try {
      fs.writeFileSync(path.join(dir, "a.png"), "png")
      useSite(garden)
      const { html, inlined } = inlineAssets('<img src="/garden/assets/a.png"><img src="/assets/a.png">', dir, () => false)
      expect(inlined).toEqual(["a.png"])
      expect(html).toBe('<img src="data:image/png;base64,cG5n"><img src="/assets/a.png">')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test("notes of a neighbour under a path link there, from an index with or without it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-base-"))
    try {
      const file = path.join(dir, "neighbours.json")
      const notes = {
        "en-US": [
          { u: "/friend/New", t: "New" },
          { u: "/Old", t: "Old" },
        ],
      }
      fs.writeFileSync(file, JSON.stringify({ friend: { url: "https://y.dev/friend", fetchedAt: 1, notes } }))
      expect(findInGarden("friend", "New", "en-US", file)).toEqual({ url: "https://y.dev/friend/New", title: "New" })
      expect(findInGarden("friend", "Old", "en-US", file)).toEqual({ url: "https://y.dev/friend/Old", title: "Old" })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("the path in the browser", () => {
  const saved = process.env.BASE_URL
  afterEach(() => {
    if (saved === undefined) delete process.env.BASE_URL
    else process.env.BASE_URL = saved
  })

  test("is Astro's BASE_URL, with a slash at its end, or the root", () => {
    delete process.env.BASE_URL
    expect(clientBase()).toBe("/")
    expect(clientWithBase("/static/graph.en.json")).toBe("/static/graph.en.json")
    process.env.BASE_URL = "/garden/"
    expect(clientBase()).toBe("/garden/")
    expect(clientWithBase("/static/graph.en.json")).toBe("/garden/static/graph.en.json")
    process.env.BASE_URL = "/garden"
    expect(clientBase()).toBe("/garden/")
    expect(clientWithBase("pagefind/pagefind.js")).toBe("/garden/pagefind/pagefind.js")
  })
})
