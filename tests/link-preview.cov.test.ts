import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import dns from "node:dns"
import * as renderCache from "../src/lib/render-cache"
import type { Element, Text } from "hast"
import type * as LinkPreview from "../src/lib/link-preview"
import { type Answer, page, stubWeb } from "./web-stub"

// The build cache is off in tests (DATME_CACHE is read once, at import), so it is stood in for by a
// map while these tests run; everywhere else the real functions keep answering, untouched.
const realRead = renderCache.readCache
const realWrite = renderCache.writeCache
const store = new Map<string, Buffer>()
let useStore = false
const id = (kind: string, parts: string[]) => `${kind}:${JSON.stringify(parts)}`
mock.module("../src/lib/render-cache", () => ({
  ...renderCache,
  readCache: (kind: string, source: string, parts: string[]) => (useStore ? store.get(id(kind, parts)) : realRead(kind, source, parts)),
  writeCache: (kind: string, source: string, parts: string[], data: string | Uint8Array) =>
    useStore ? void store.set(id(kind, parts), Buffer.from(data)) : realWrite(kind, source, parts, data),
}))

let lp: typeof LinkPreview
let web: ReturnType<typeof stubWeb> | undefined
let fetched: () => string[] = () => []
/** Stub the web with a function answering each URL. */
const stubFetch = (answer: (url: string) => Answer) => {
  web = stubWeb(answer)
  fetched = web.urls
}
const html = (body: string, headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" }) => ({ ...page(body), headers })
const cached = (url: string) => {
  const hit = store.get(id("preview", [url]))
  return hit ? JSON.parse(hit.toString("utf8")) : undefined
}

beforeAll(async () => {
  lp = await import("../src/lib/link-preview")
  useStore = true
})
// lp-cov.example stands on the public web.
let lookup: ReturnType<typeof spyOn>
beforeEach(() => {
  lookup = spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "93.184.215.14", family: 4 }] as never)
})
afterEach(() => {
  web?.restore()
  web = undefined
  fetched = () => []
  lookup.mockRestore()
})
afterAll(() => {
  useStore = false
})

describe("parsePreview", () => {
  test("numeric entities are decoded, Twitter cards stand in for OpenGraph, and long texts are cut", () => {
    const p = lp.parsePreview(
      `<meta name='twitter:title' content='Caf&#233; &#x2014; &lt;menu&gt; &quot;today&quot; &#39;s&apos;'>
       <meta name="twitter:description" content="${"d".repeat(400)}">
       <meta name="twitter:image" content="https://cdn.example/a.png">
       <meta name="twitter:title" content="ignored: the first one wins">`,
      "https://www.cafe.example/menu",
    )
    expect(p).toEqual({
      title: `Café — <menu> "today" 's'`,
      description: "d".repeat(300),
      image: "https://cdn.example/a.png",
      site: "cafe.example",
    })
    expect(lp.parsePreview(`<title>${"t".repeat(300)}</title>`, "https://x.example")!.title).toHaveLength(200)
  })

  test("an image that is no URL, or not on the web, is left out; meta tags without content are ignored", () => {
    expect(
      lp.parsePreview('<meta property="og:title" content="T"><meta property="og:image" content="http://[bad">', "https://x.example")!.image,
    ).toBeUndefined()
    expect(
      lp.parsePreview('<meta property="og:title" content="T"><meta property="og:image:url" content="data:image/png;base64,AA">', "https://x.example")!.image,
    ).toBeUndefined()
    expect(lp.parsePreview('<meta property="og:title"><meta name="description" content="">', "https://x.example")).toBeUndefined()
  })
})

describe("linkPreview", () => {
  test("the head of an HTML page is read, once per URL, and the preview cached", async () => {
    const url = "https://lp-cov.example/page"
    stubFetch(() => html('<html><head><meta property="og:title" content="Page"></head><body>…</body></html>'))
    const [a, b] = await Promise.all([lp.linkPreview(url), lp.linkPreview(url)])
    expect(a).toEqual({ title: "Page", description: undefined, image: undefined, site: "lp-cov.example" })
    expect(b).toBe(a)
    expect(fetched()).toEqual([url])
    expect(cached(url)).toEqual({ preview: a })
  })

  test("reading stops at the end of the head or the size limit, even on a stream that goes on", async () => {
    const url = "https://lp-cov.example/stream"
    const enc = new TextEncoder()
    let pulled = 0
    stubFetch(() => ({
      headers: { "content-type": "text/html" },
      body: (function* () {
        // Never ends on its own: only the reader stopping ends it.
        for (;;) yield enc.encode(pulled++ === 0 ? "<title>Big" : "x".repeat(300 * 1024))
      })(),
    }))
    const p = await lp.linkPreview(url)
    // The title never closes within the limit, so there is nothing to show.
    expect(p).toBeUndefined()
    expect(pulled).toBeLessThan(5)
    expect(cached(url).failedAt).toBeNumber()
  })

  test("a page ending without </head> is read to its end", async () => {
    const url = "https://lp-cov.example/short"
    stubFetch(() => html("<title>Short</title>"))
    expect((await lp.linkPreview(url))!.title).toBe("Short")
  })

  test("what is not an HTML page gives no preview, and is remembered as a failure", async () => {
    const before = Date.now()
    stubFetch((u) =>
      u.endsWith("/json")
        ? html("{}", { "content-type": "application/json" })
        : u.endsWith("/404")
          ? { status: 404, headers: { "content-type": "text/html" }, body: "<title>Not found</title>" }
          : u.endsWith("/moved-nowhere")
            ? { status: 301, headers: { "content-type": "text/html" }, body: "<title>Moved</title>" }
            : u.endsWith("/info")
              ? { status: 199, headers: { "content-type": "text/html" } }
              : u.endsWith("/notype")
                ? { headers: {}, body: "<title>T</title>" }
                : html(""),
    )
    for (const tail of ["/json", "/404", "/moved-nowhere", "/info", "/notype", "/blank"]) {
      const url = "https://lp-cov.example" + tail
      expect(await lp.linkPreview(url)).toBeUndefined()
      expect(cached(url).failedAt).toBeGreaterThanOrEqual(before)
    }
  })

  test("an empty page, and a request that fails, do not break the build", async () => {
    stubFetch((u) => {
      if (u.endsWith("/throws")) throw new Error("ECONNRESET")
      return { headers: { "content-type": "text/html" } }
    })
    expect(await lp.linkPreview("https://lp-cov.example/empty")).toBeUndefined()
    expect(await lp.linkPreview("https://lp-cov.example/throws")).toBeUndefined()
    expect(cached("https://lp-cov.example/throws").failedAt).toBeNumber()
  })

  test("a cached preview is used without the network; a recent failure is not retried, an old one is", async () => {
    stubFetch(() => html("<title>Fresh</title>"))
    const hit = "https://lp-cov.example/cached"
    store.set(id("preview", [hit]), Buffer.from(JSON.stringify({ preview: { title: "From cache" } })))
    expect(await lp.linkPreview(hit)).toEqual({ title: "From cache" })

    const recent = "https://lp-cov.example/recent-failure"
    store.set(id("preview", [recent]), Buffer.from(JSON.stringify({ failedAt: Date.now() - 1000 })))
    expect(await lp.linkPreview(recent)).toBeUndefined()
    expect(fetched()).toEqual([])

    const old = "https://lp-cov.example/old-failure"
    store.set(id("preview", [old]), Buffer.from(JSON.stringify({ failedAt: Date.now() - 8 * 86_400_000 })))
    expect((await lp.linkPreview(old))!.title).toBe("Fresh")
    expect(fetched()).toEqual([old])
    expect(cached(old).preview.title).toBe("Fresh")
  })
})

describe("previewCard", () => {
  test("a card without description or site falls back to the URL's host; an image is lazy and sends no referrer", () => {
    const card = lp.previewCard("https://host.example/a", { title: "T", image: "https://host.example/i.png" })
    const parts = (card.children[0] as Element).children as Element[]
    expect(parts.map((c) => c.tagName)).toEqual(["strong", "small"])
    expect((parts[1].children[0] as Text).value).toBe("host.example")
    expect(card.children[1]).toMatchObject({
      tagName: "img",
      properties: { src: "https://host.example/i.png", loading: "lazy", referrerPolicy: "no-referrer" },
    })
    const withDesc = lp.previewCard("https://host.example/a", { title: "T", description: "D", site: "Host" })
    expect(withDesc.children).toHaveLength(1)
    expect(JSON.stringify(withDesc)).toContain('"link-card-desc"')
    expect(JSON.stringify(withDesc)).toContain('"value":"Host"')
  })
})
