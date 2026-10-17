import { afterEach, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import type { APIContext, APIRoute } from "astro"
import { site, type SiteConfig } from "../src/site.config"
import { getVault } from "../src/lib/vault"
import { setEmbedder } from "../src/lib/embeddings"
import * as md from "../src/pages/[...md].md"
import * as oembed from "../src/pages/[...path].oembed.json"
import * as changes from "../src/pages/[...path]/changes.xml"
import * as rss from "../src/pages/[...path]/index.xml"
import * as pwa from "../src/pages/[pwa]"
import * as txt from "../src/pages/[txt].txt"
import * as assets from "../src/pages/assets/[...path]"
import * as customCss from "../src/pages/custom.css"
import * as favicon from "../src/pages/favicon.svg"
import * as og from "../src/pages/og/[...slug].png"
import * as robots from "../src/pages/robots.txt"
import * as cards from "../src/pages/static/cards.[lang].json"
import * as contentIndex from "../src/pages/static/contentIndex.[lang].json"
import * as graphIndex from "../src/pages/static/graph.[lang].json"
import * as vectors from "../src/pages/static/vectors.[lang].json"
import * as history from "../src/lib/history"

/** Change some settings for the length of a test; restored after each one. */
const saved: Partial<SiteConfig>[] = []
function setSite(patch: Partial<SiteConfig>): void {
  saved.push(Object.fromEntries(Object.keys(patch).map((k) => [k, site[k as keyof SiteConfig]])) as Partial<SiteConfig>)
  Object.assign(site, patch)
}
afterEach(() => {
  while (saved.length) Object.assign(site, saved.pop())
})

/** What Astro hands an endpoint, as far as datme's endpoints read it. */
const call = async <P extends Record<string, unknown>>(GET: APIRoute<P>, params: Record<string, string | undefined>, props: P = {} as P) =>
  await GET({ params, props } as unknown as APIContext<P>)
const type = (r: Response) => r.headers.get("content-type")

describe("markdown copies", () => {
  test("every public note, at its own path, unless llms is off", async () => {
    const paths = md.getStaticPaths()
    const talk = paths.find((p) => p.params.md === "07_Project/Talk")!
    expect(talk).toBeDefined()
    expect(paths.some((p) => p.params.md === "en-US/07_Project/Talk")).toBe(true)
    expect(paths.some((p) => p.params.md.includes("Secret"))).toBe(false)
    const r = await call(md.GET, talk.params, talk.props)
    expect(type(r)).toBe("text/markdown; charset=utf-8")
    expect(await r.text()).toContain("# Slip-box talk")
    setSite({ llms: false })
    expect(md.getStaticPaths()).toEqual([])
  }, 60_000)
})

describe("oEmbed JSON", () => {
  test("one per embeddable note, next to its page", async () => {
    const paths = oembed.getStaticPaths()
    const talk = paths.find((p) => p.params.path === "07_Project/Talk")!
    expect(paths.some((p) => p.params.path === "en-US/07_Project/Talk")).toBe(true)
    expect(paths.some((p) => p.props.note.isHome)).toBe(false)
    const r = await call(oembed.GET, talk.params, talk.props)
    expect(type(r)).toBe("application/json+oembed; charset=utf-8")
    expect(JSON.parse(await r.text())).toMatchObject({ type: "rich", version: "1.0" })
    setSite({ url: undefined })
    expect(oembed.getStaticPaths()).toEqual([])
  }, 60_000)
})

describe("RSS", () => {
  test("a feed for the site, each folder and each tag, per language", async () => {
    const paths = rss.getStaticPaths()
    expect(paths.find((p) => p.params.path === undefined)?.props).toEqual({ lang: "vi-VN", scope: { kind: "site" } })
    expect(paths.find((p) => p.params.path === "en-US")?.props.lang).toBe("en-US")
    expect(paths.find((p) => p.params.path === "07_Project")?.props.scope).toEqual({ kind: "folder", dir: "07_Project" })
    expect(paths.some((p) => p.props.scope.kind === "tag")).toBe(true)
    const r = await rss.GET({ props: { lang: "en-US", scope: { kind: "folder", dir: "07_Project" } } })
    expect(await r.text()).toContain("<language>en-US</language>")
  }, 60_000)

  test("changes feeds exist only with history", async () => {
    expect(changes.getStaticPaths()).toEqual([])
    setSite({ history: true })
    const versions = spyOn(history, "noteVersions").mockImplementation(() => [
      { date: new Date("2026-01-05T10:00:00Z"), text: "A seed." },
      { date: new Date("2026-02-05T10:00:00Z"), text: "A seed.\n\nA second paragraph with words." },
    ])
    try {
      const paths = changes.getStaticPaths()
      expect(paths.find((p) => p.params.path === undefined)?.props.scope).toEqual({ kind: "site" })
      expect(paths.find((p) => p.params.path === "en-US/07_Project")?.props.scope).toEqual({ kind: "folder", dir: "07_Project" })
      expect(paths.some((p) => p.params.path?.startsWith("tags/"))).toBe(true)
      const xml = await (await changes.GET({ props: { lang: "vi-VN", scope: { kind: "site" } } })).text()
      expect(xml).toContain("A second paragraph with words.")
    } finally {
      versions.mockRestore()
    }
  })
})

describe("installable app", () => {
  test("manifest, service worker and icons, only when offline is on", async () => {
    const paths = pwa.getStaticPaths().map((p) => p.params.pwa)
    expect(paths).toEqual(["manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png"])
    const manifest = await call(pwa.GET, { pwa: "manifest.webmanifest" })
    expect(type(manifest)).toBe("application/manifest+json")
    expect(JSON.parse(await manifest.text()).name).toBeDefined()
    const sw = await call(pwa.GET, { pwa: "sw.js" })
    expect(type(sw)).toBe("text/javascript; charset=utf-8")
    expect((await sw.text()).length).toBeGreaterThan(0)
    for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512]] as const) {
      const icon = await call(pwa.GET, { pwa: name })
      expect(type(icon)).toBe("image/png")
      const png = new Uint8Array(await icon.arrayBuffer())
      expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG")
      // Width, big-endian, in the IHDR chunk.
      expect(new DataView(png.buffer).getUint32(16)).toBe(size)
    }
    setSite({ offline: false })
    expect(pwa.getStaticPaths()).toEqual([])
  }, 60_000)
})

describe("llms.txt", () => {
  test("the short and the full text, unless llms is off", async () => {
    expect(txt.getStaticPaths()).toEqual([{ params: { txt: "llms" } }, { params: { txt: "llms-full" } }])
    const short = await call(txt.GET, { txt: "llms" })
    expect(type(short)).toBe("text/plain; charset=utf-8")
    const full = await call(txt.GET, { txt: "llms-full" })
    expect((await full.text()).length).toBeGreaterThan((await short.text()).length)
    setSite({ llms: false })
    expect(txt.getStaticPaths()).toEqual([])
  }, 60_000)
})

describe("assets", () => {
  test("each referenced asset, with resized copies of wide images", async () => {
    const paths = (await assets.getStaticPaths()).map((p) => p.params.path)
    expect(paths).toContain("_assets/images/wide.png")
    expect(paths.some((p) => /^_assets\/images\/wide\.png\.w\d+\.webp$/.test(p))).toBe(true)
    expect(paths).toContain("_assets/draw/Flow.excalidraw.light.svg")
  }, 60_000)

  test("originals with their media type, variants as WebP, anything else 404", async () => {
    const png = await call(assets.GET, { path: "_assets/images/wide.png" })
    expect(type(png)).toBe("image/png")
    expect(Buffer.from(await png.arrayBuffer()).equals(fs.readFileSync(path.join(site.vault, "_assets/images/wide.png")))).toBe(true)
    const svg = await call(assets.GET, { path: "_assets/draw/Flow.excalidraw.light.svg" })
    expect(type(svg)).toBe("image/svg+xml")
    const variant = (await assets.getStaticPaths()).map((p) => p.params.path).find((p) => p.endsWith(".webp"))!
    const webp = await call(assets.GET, { path: variant })
    expect(type(webp)).toBe("image/webp")
    expect(Buffer.from(await webp.arrayBuffer()).subarray(8, 12).toString()).toBe("WEBP")
    expect((await call(assets.GET, { path: "_assets/images/wide.png.w7.webp" })).status).toBe(404)
    expect((await call(assets.GET, { path: "_assets/images/nope.png.w480.webp" })).status).toBe(404)
    expect((await call(assets.GET, { path: "06_Reference/Secret.md" })).status).toBe(404)
  }, 60_000)

  test("an asset of an unknown kind is served as bytes", async () => {
    const vault = getVault()
    const rel = "datme.css"
    vault.assets.add(rel)
    try {
      const r = await call(assets.GET, { path: rel })
      expect(type(r)).toBe("application/octet-stream")
    } finally {
      vault.assets.delete(rel)
    }
  })
})

describe("small files", () => {
  test("custom.css is the vault's stylesheet, or empty", async () => {
    const r = customCss.GET()
    expect(type(r)).toBe("text/css; charset=utf-8")
    expect(await r.text()).toBe(fs.readFileSync(path.join(site.vault, "datme.css"), "utf8"))
    setSite({ theme: { ...site.theme, css: "missing.css" } })
    expect(await customCss.GET().text()).toBe("")
  })

  test("the favicon draws the logo, escaped", async () => {
    setSite({ logo: "<&>" })
    const r = favicon.GET()
    expect(type(r)).toBe("image/svg+xml")
    expect(await r.text()).toContain(">&lt;&amp;></text></svg>")
  })

  test("robots.txt points at the sitemap when the URL is known", async () => {
    const r = robots.GET()
    expect(type(r)).toBe("text/plain; charset=utf-8")
    expect(await r.text()).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap-index.xml\n`)
    setSite({ url: undefined })
    expect(await robots.GET().text()).toBe("User-agent: *\nAllow: /\n")
  })
})

describe("social cards", () => {
  test("one per home page and per note without a banner, unless cards are off", () => {
    const paths = og.getStaticPaths()
    expect(paths.find((p) => p.params.slug === "index")?.props).toEqual({ lang: "vi-VN" })
    expect(paths.some((p) => p.params.slug === "en-US/index")).toBe(true)
    expect(paths.some((p) => p.params.slug === "07_Project/Talk")).toBe(true)
    expect(paths.some((p) => p.params.slug === "07_Project/Blog-post")).toBe(false)
    setSite({ ogImages: false })
    expect(og.getStaticPaths()).toEqual([])
  })

  test("a PNG for the home page and for a note", async () => {
    const paths = og.getStaticPaths()
    for (const p of [paths.find((x) => x.params.slug === "index")!, paths.find((x) => x.params.slug === "07_Project/Talk")!]) {
      const r = await call(og.GET, p.params, p.props)
      expect(type(r)).toBe("image/png")
      expect(Buffer.from(await r.arrayBuffer()).subarray(1, 4).toString()).toBe("PNG")
    }
    // A note outside the stages, without words, on a site without a tagline.
    setSite({ tagline: { "vi-VN": "", "en-US": "" } })
    const home = await call(og.GET, {}, { lang: "en-US" })
    expect(type(home)).toBe("image/png")
    const daily = getVault().byKey["vi-VN"].get("08_Journal/2026-10-05")!
    const r = await call(og.GET, {}, { lang: "vi-VN", note: { ...daily, stage: undefined, created: undefined } })
    expect(type(r)).toBe("image/png")
  }, 120_000)
})

describe("practice cards", () => {
  test("the decks of each language that has some", async () => {
    const paths = cards.getStaticPaths()
    expect(paths).toEqual([{ params: { lang: "vi-VN" } }, { params: { lang: "en-US" } }])
    const r = await call(cards.GET, { lang: "en-US" })
    expect(type(r)).toBe("application/json; charset=utf-8")
    const { decks } = JSON.parse(await r.text())
    expect(decks).toEqual([expect.objectContaining({ u: "/en-US/07_Project/Deck", t: expect.any(String), g: expect.any(Array), h: expect.any(String) })])
  }, 60_000)
})

describe("content index", () => {
  test("one per language, with notes and their links, private links left out", async () => {
    expect(contentIndex.getStaticPaths()).toEqual([{ params: { lang: "vi-VN" } }, { params: { lang: "en-US" } }])
    const r = await call(contentIndex.GET, { lang: "vi-VN" })
    expect(type(r)).toBe("application/json; charset=utf-8")
    const { notes, links } = JSON.parse(await r.text())
    const talk = notes.find((n: { u: string }) => n.u === "/07_Project/Talk")
    expect(talk).toMatchObject({ s: "🧪", st: "Thử nghiệm", p: "07_Project", tp: "" })
    expect(talk.c.length).toBeGreaterThan(0)
    const home = notes.find((n: { u: string }) => n.u === "/")
    expect(home.s).toBeNull()
    expect(links.length).toBeGreaterThan(0)
    for (const [a, b] of links) expect(a).not.toBe(b)
    expect(new Set(links.map(([a, b]: number[]) => `${Math.min(a, b)}-${Math.max(a, b)}`)).size).toBe(links.length)
  }, 60_000)

  test("with Pagefind the text is left out, and a note without dates has none", async () => {
    setSite({ search: { engine: "pagefind", meaning: false } })
    const vault = getVault()
    const talk = vault.byKey["vi-VN"].get("07_Project/Talk")!
    const { created, updated } = talk
    talk.created = undefined
    talk.updated = undefined
    try {
      const { notes } = JSON.parse(await (await call(contentIndex.GET, { lang: "vi-VN" })).text())
      for (const n of notes) expect(n.c).toBe("")
      expect(notes.find((n: { u: string }) => n.u === "/07_Project/Talk")).toMatchObject({ k: null, m: null })
    } finally {
      talk.created = created
      talk.updated = updated
    }
  }, 60_000)
})

describe("graph index", () => {
  test("one per language: the content index without text or description, links the same", async () => {
    expect(graphIndex.getStaticPaths()).toEqual([{ params: { lang: "vi-VN" } }, { params: { lang: "en-US" } }])
    const r = await call(graphIndex.GET, { lang: "vi-VN" })
    expect(type(r)).toBe("application/json; charset=utf-8")
    const slim = JSON.parse(await r.text())
    const full = JSON.parse(await (await call(contentIndex.GET, { lang: "vi-VN" })).text())
    expect(slim.links).toEqual(full.links)
    expect(slim.notes).toEqual(full.notes.map(({ c: _c, d: _d, ...rest }: Record<string, unknown>) => rest))
    for (const n of slim.notes) expect(Object.keys(n).sort()).toEqual(["a", "f", "g", "k", "m", "p", "s", "st", "t", "tp", "u", "y"])
  }, 60_000)
})

describe("note vectors", () => {
  test("only with related.semantic", async () => {
    expect(vectors.getStaticPaths()).toEqual([])
    expect((await call(vectors.GET, { lang: "vi-VN" })).status).toBe(404)
  })

  test("one quantized vector per listed note", async () => {
    setSite({ related: { ...site.related, semantic: { model: "test-model", threshold: 0.5 } } })
    setEmbedder(async (texts) => texts.map(() => [0.6, 0.8, 0]))
    try {
      expect(vectors.getStaticPaths()).toEqual([{ params: { lang: "vi-VN" } }, { params: { lang: "en-US" } }])
      const r = await call(vectors.GET, { lang: "vi-VN" })
      expect(type(r)).toBe("application/json; charset=utf-8")
      const body = JSON.parse(await r.text())
      expect(body).toMatchObject({ model: "test-model", dims: 3 })
      expect(body.notes.some((n: { u: string }) => n.u === "/07_Project/Talk")).toBe(true)
      expect(body.notes.some((n: { u: string }) => n.u.includes("Secret"))).toBe(false)
    } finally {
      setEmbedder(undefined)
    }
  })
})
