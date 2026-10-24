import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import dns from "node:dns"
import http from "node:http"
import { linkPreview, parsePreview } from "../src/lib/link-preview"
import { renderMarkdown } from "../src/lib/markdown"
import { type Answer, notFound, page, redirect, stubWeb } from "./web-stub"

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

  // No network: requests are answered from `pages`, DNS from `hosts`; both are put back after each test.
  const pages: Record<string, Answer> = {}
  const hosts: Record<string, string[] | (() => string[])> = {}
  let web: ReturnType<typeof stubWeb>
  let lookup: ReturnType<typeof spyOn>
  beforeEach(() => {
    web = stubWeb((url) => pages[url] ?? notFound)
    lookup = spyOn(dns.promises, "lookup").mockImplementation((async (host: string) => {
      const entry = hosts[host]
      const addresses = typeof entry === "function" ? entry() : entry
      if (!addresses) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" })
      return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))
    }) as never)
  })
  afterEach(() => {
    web.restore()
    lookup.mockRestore()
  })
  const card = (title: string) => page(`<head><meta property="og:title" content="${title}"></head>`)

  test("a paragraph that is only a URL becomes a card; links in sentences stay links", async () => {
    const url = "https://blog.example/post"
    hosts["blog.example"] = ["93.184.215.14"]
    pages[url] = page('<head><meta property="og:title" content="A post"><meta property="og:description" content="About it"></head>')
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
    for (const url of urls) pages[url] = card("secret")
    for (const url of urls) expect(await linkPreview(url)).toBeUndefined()
    expect(web.requests).toEqual([])
  })

  test("redirects are followed by hand, at most three, each hop checked", async () => {
    hosts["blog.example"] = ["93.184.215.14"]
    hosts["intranet.example"] = ["10.1.2.3"]
    pages["https://blog.example/moved"] = redirect("/r1")
    pages["https://blog.example/r1"] = redirect("https://blog.example/final")
    pages["https://blog.example/final"] = card("Arrived")
    expect((await linkPreview("https://blog.example/moved"))?.title).toBe("Arrived")
    expect(web.urls()).toEqual(["https://blog.example/moved", "https://blog.example/r1", "https://blog.example/final"])

    web.requests.length = 0
    pages["https://blog.example/sneaky"] = redirect("http://intranet.example/")
    pages["http://intranet.example/"] = card("secret")
    expect(await linkPreview("https://blog.example/sneaky")).toBeUndefined()
    expect(web.urls()).toEqual(["https://blog.example/sneaky"])

    web.requests.length = 0
    pages["https://blog.example/to-ip"] = redirect("http://169.254.169.254/latest/meta-data/")
    pages["http://169.254.169.254/latest/meta-data/"] = card("secret")
    expect(await linkPreview("https://blog.example/to-ip")).toBeUndefined()
    expect(web.urls()).toEqual(["https://blog.example/to-ip"])

    web.requests.length = 0
    for (let i = 0; i < 5; i++) pages[`https://blog.example/loop${i}`] = redirect(`/loop${i + 1}`)
    pages["https://blog.example/loop5"] = card("Too far")
    expect(await linkPreview("https://blog.example/loop0")).toBeUndefined()
    expect(web.requests).toHaveLength(4)
  })

  test("more addresses no build should reach: NAT64, 6to4, Teredo, site-local, IPv4-compatible, documentation, CGNAT", async () => {
    const addresses = [
      "100.64.0.1",
      "100.127.255.254",
      "192.0.2.10",
      "198.51.100.10",
      "203.0.113.10",
      "::127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:a9fe:a9fe",
      "64:ff9b::a00:1",
      "64:ff9b:1::1",
      "2002:a00:1::1",
      "2001::1",
      "2001:db8::1",
      "fec0::1",
      "100::1",
    ]
    for (const [i, address] of addresses.entries()) {
      hosts[`odd${i}.example`] = [address]
      pages[`https://odd${i}.example/`] = card("secret")
      expect(await linkPreview(`https://odd${i}.example/`)).toBeUndefined()
    }
    expect(web.requests).toEqual([])
  })

  test("a name that does not resolve, or resolves to nothing, is not fetched", async () => {
    hosts["empty.example"] = []
    for (const url of ["https://nowhere.example/", "https://empty.example/"]) {
      pages[url] = card("secret")
      expect(await linkPreview(url)).toBeUndefined()
    }
    expect(web.requests).toEqual([])
  })

  test("DNS rebinding: the connection goes to the address that was checked, not to a later answer", async () => {
    let asked = 0
    // Public the first time, this machine every time after.
    hosts["rebind.example"] = () => (asked++ === 0 ? ["93.184.215.14"] : ["127.0.0.1"])
    pages["https://rebind.example/post"] = card("Public")
    expect((await linkPreview("https://rebind.example/post"))?.title).toBe("Public")
    expect(asked).toBe(1)
    expect(web.requests).toEqual([
      {
        url: "https://rebind.example/post",
        address: "93.184.215.14",
        client: "https",
        headers: expect.objectContaining({ accept: "text/html" }),
      },
    ])
  })

  test("each hop of a redirect is resolved once and connected to as checked", async () => {
    let asked = 0
    hosts["blog.example"] = ["93.184.215.14"]
    hosts["rebind.example"] = () => (asked++ === 0 ? ["2606:2800:21f:cb07:6820:80da:af6b:8b2c"] : ["::1"])
    pages["https://blog.example/away"] = redirect("http://rebind.example/there")
    pages["http://rebind.example/there"] = card("There")
    expect((await linkPreview("https://blog.example/away"))?.title).toBe("There")
    expect(asked).toBe(1)
    expect(web.requests.map((r) => [r.url, r.address, r.client])).toEqual([
      ["https://blog.example/away", "93.184.215.14", "https"],
      ["http://rebind.example/there", "2606:2800:21f:cb07:6820:80da:af6b:8b2c", "http"],
    ])
  })

  test("a public address written in the URL is connected to as it is", async () => {
    pages["http://93.184.215.14/"] = card("By address")
    pages["https://[2606:2800:21f:cb07:6820:80da:af6b:8b2c]/"] = card("By IPv6")
    expect((await linkPreview("http://93.184.215.14/"))?.title).toBe("By address")
    expect((await linkPreview("https://[2606:2800:21f:cb07:6820:80da:af6b:8b2c]/"))?.title).toBe("By IPv6")
    expect(lookup).not.toHaveBeenCalled()
    expect(web.requests.map((r) => r.address)).toEqual(["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"])
  })

  test("the real client connects where the checked lookup says, with the URL's name in the Host header", async () => {
    web.restore()
    // A server on this machine stands for the public address; the name exists in no DNS.
    const seen: string[] = []
    const server = http.createServer((req, res) => {
      seen.push(req.headers.host ?? "")
      res.writeHead(200, { "content-type": "text/html" }).end("<head><title>Pinned</title></head>")
    })
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
    const { port } = server.address() as { port: number }
    let asked = 0
    hosts["pinned.example"] = () => (asked++ === 0 ? ["93.184.215.14"] : ["10.0.0.1"])
    const real = http.request
    const connected: string[] = []
    type Done = (err: Error | null, address: unknown, family?: number) => void
    type Lookup = (host: string, options: { all?: boolean }, done: Done) => void
    const spy = spyOn(http, "request").mockImplementation(((url: URL, options: { lookup: Lookup }, callback: () => void) =>
      real(
        url,
        {
          ...options,
          lookup: (host, opts, done) =>
            options.lookup(host, opts, (err, address, family) => {
              const list = address as { address: string; family: number }[]
              connected.push(Array.isArray(list) ? list[0].address : (address as string))
              const local = { address: "127.0.0.1", family: 4 }
              done(err, Array.isArray(list) ? [local] : local.address, Array.isArray(list) ? undefined : family)
            }),
        } as http.RequestOptions,
        callback,
      )) as never)
    try {
      expect((await linkPreview(`http://pinned.example:${port}/`))?.title).toBe("Pinned")
    } finally {
      spy.mockRestore()
      server.close()
    }
    expect(asked).toBe(1)
    expect(connected.length).toBeGreaterThan(0)
    expect(new Set(connected)).toEqual(new Set(["93.184.215.14"]))
    expect(seen).toEqual([`pinned.example:${port}`])
  })
})
