import { afterAll, describe, expect, test } from "bun:test"
import { checkExternal, externalUrls, probe } from "../src/lib/links"
import { externalLinks } from "../src/lib/check"

describe("externalUrls", () => {
  test("markdown links, autolinks, bare URLs and HTML attributes, without code", () => {
    const md = [
      "See [docs](https://a.example/docs) and <https://b.example/x>.",
      "Bare https://c.example/page, then https://en.wikipedia.org/wiki/Foo_(bar).",
      '<iframe src="https://d.example/embed"></iframe>',
      "`https://code.example/inline` and",
      "```",
      "https://code.example/block",
      "```",
    ].join("\n")
    expect(externalUrls(md)).toEqual([
      "https://a.example/docs",
      "https://d.example/embed",
      "https://b.example/x",
      "https://c.example/page",
      "https://en.wikipedia.org/wiki/Foo_(bar)",
    ])
  })

  test("the fixture vault's external links are collected per file", () => {
    const urls = externalLinks()
    expect(urls.get("https://github.com/example")).toBeUndefined()
    expect([...urls.keys()].every((u) => u.startsWith("http"))).toBe(true)
  })
})

describe("probe", () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url)
      if (pathname === "/ok") return new Response("ok")
      if (pathname === "/gone") return new Response("", { status: 410 })
      if (pathname === "/no-head") return req.method === "HEAD" ? new Response("", { status: 405 }) : new Response("ok")
      if (pathname === "/login") return new Response("", { status: 401 })
      if (pathname === "/down") return new Response("", { status: 503 })
      if (pathname === "/redirect") return Response.redirect(new URL("/ok", req.url).href, 301)
      return new Response("", { status: 404 })
    },
  })
  afterAll(() => server.stop(true))
  const url = (p: string) => new URL(p, server.url).href

  test("live pages, redirects and servers refusing HEAD are fine", async () => {
    for (const p of ["/ok", "/redirect", "/no-head"]) expect(await probe(url(p))).toEqual({ ok: true })
  })

  test("404 and 410 are dead links", async () => {
    expect(await probe(url("/missing"))).toEqual({ ok: false, level: "warning", reason: "returned 404" })
    expect(await probe(url("/gone"))).toEqual({ ok: false, level: "warning", reason: "returned 410" })
  })

  test("logins and outages cannot tell, so they are only informational", async () => {
    expect(await probe(url("/login"))).toMatchObject({ ok: false, level: "info" })
    expect(await probe(url("/down"))).toMatchObject({ ok: false, level: "info" })
  })

  test("an unreachable host is a dead link", async () => {
    const r = await probe("http://127.0.0.1:1/", { timeoutMs: 2000 })
    expect(r).toMatchObject({ ok: false, level: "warning" })
  })

  test("problems name every file linking the URL", async () => {
    const problems = await checkExternal(
      new Map([
        [url("/ok"), ["a.md"]],
        [url("/missing"), ["a.md", "b.md"]],
      ]),
    )
    expect(problems.map((p) => p.file)).toEqual(["a.md", "b.md"])
    expect(problems[0].message).toBe(`external link ${url("/missing")} returned 404`)
  })
})
