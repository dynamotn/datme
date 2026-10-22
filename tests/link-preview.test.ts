import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import dns from "node:dns"
import { linkPreview, parsePreview } from "../src/lib/link-preview"
import { renderMarkdown } from "../src/lib/markdown"

describe("link previews", () => {
  test("OpenGraph first, then Twitter cards, then the title; images made absolute", () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="The &amp; Title">
      <meta name="description" content="Plain description">
      <meta property="og:image" content="/cover.png">
      <meta property="og:site_name" content="Example">
      </head></html>`
    expect(parsePreview(html, "https://example.com/post")).toEqual({
      title: "The & Title",
      description: "Plain description",
      image: "https://example.com/cover.png",
      site: "Example",
    })
    expect(parsePreview("<title> Only  a title </title>", "https://www.example.org/x")).toEqual({
      title: "Only a title",
      description: undefined,
      image: undefined,
      site: "example.org",
    })
    expect(parsePreview("<p>no head</p>", "https://example.com")).toBeUndefined()
  })

  // No network: fetch answers from `pages`, DNS from `hosts`; both are put back after each test.
  const pages: Record<string, () => Response> = {}
  const hosts: Record<string, string[]> = {}
  let fetched: string[] = []
  const realFetch = globalThis.fetch
  let lookup: ReturnType<typeof spyOn>
  beforeEach(() => {
    fetched = []
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      fetched.push(url)
      expect(init?.redirect).toBe("manual")
      return pages[url]?.() ?? new Response("nope", { status: 404 })
    }) as unknown as typeof fetch
    lookup = spyOn(dns.promises, "lookup").mockImplementation((async (host: string) => {
      const addresses = hosts[host]
      if (!addresses) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" })
      return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))
    }) as never)
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    lookup.mockRestore()
  })
  const page = (title: string) => () => new Response(`<head><meta property="og:title" content="${title}"></head>`, { headers: { "content-type": "text/html" } })
  const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } })

  test("a paragraph that is only a URL becomes a card; links in sentences stay links", async () => {
    const url = "https://blog.example/post"
    hosts["blog.example"] = ["93.184.215.14"]
    pages[url] = () =>
      new Response('<head><meta property="og:title" content="A post"><meta property="og:description" content="About it"></head>', {
        headers: { "content-type": "text/html" },
      })
    const html = await renderMarkdown(`${url}\n\nRead ${url} later.`, "en-US", "x")
    expect(html).toContain(
      `<a class="link-card external" href="${url}" target="_blank" rel="noopener noreferrer"><span class="link-card-text"><strong>A post</strong>`,
    )
    expect(html).toContain('<span class="link-card-desc">About it</span>')
    expect(html).toMatch(/Read <a href="[^"]+" target="_blank" rel="noopener noreferrer" class="external">/)
  })

  test("a page that cannot be read leaves the link as it is", async () => {
    const url = "https://blog.example/missing"
    hosts["blog.example"] = ["93.184.215.14"]
    const html = await renderMarkdown(url, "en-US", "x")
    expect(html).not.toContain("link-card")
    expect(html).toContain(`href="${url}"`)
  })

  test("the build never asks the machine or network it runs on: local and private hosts are refused", async () => {
    hosts["intranet.example"] = ["10.1.2.3"]
    hosts["mixed.example"] = ["93.184.215.14", "fd00::1"]
    hosts["mapped.example"] = ["::ffff:127.0.0.1"]
    const urls = [
      "http://localhost:8080/admin",
      "http://app.localhost/",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data/",
      "http://192.168.1.1/",
      "http://0.0.0.0/",
      "http://2130706433/",
      "https://intranet.example/",
      "https://mixed.example/",
      "https://mapped.example/",
      "ftp://files.example/",
    ]
    for (const url of urls) pages[url] = page("secret")
    for (const url of urls) expect(await linkPreview(url)).toBeUndefined()
    expect(fetched).toEqual([])
  })

  test("redirects are followed by hand, at most three, each hop checked", async () => {
    hosts["blog.example"] = ["93.184.215.14"]
    hosts["intranet.example"] = ["10.1.2.3"]
    pages["https://blog.example/moved"] = redirect("/r1")
    pages["https://blog.example/r1"] = redirect("https://blog.example/final")
    pages["https://blog.example/final"] = page("Arrived")
    expect((await linkPreview("https://blog.example/moved"))?.title).toBe("Arrived")
    expect(fetched).toEqual(["https://blog.example/moved", "https://blog.example/r1", "https://blog.example/final"])

    fetched = []
    pages["https://blog.example/sneaky"] = redirect("http://intranet.example/")
    pages["http://intranet.example/"] = page("secret")
    expect(await linkPreview("https://blog.example/sneaky")).toBeUndefined()
    expect(fetched).toEqual(["https://blog.example/sneaky"])

    fetched = []
    for (let i = 0; i < 5; i++) pages[`https://blog.example/loop${i}`] = redirect(`/loop${i + 1}`)
    pages["https://blog.example/loop5"] = page("Too far")
    expect(await linkPreview("https://blog.example/loop0")).toBeUndefined()
    expect(fetched).toHaveLength(4)
  })
})
