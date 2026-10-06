import { afterAll, describe, expect, test } from "bun:test"
import { parsePreview } from "../src/lib/link-preview"
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

  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname
      if (path === "/post") {
        return new Response('<head><meta property="og:title" content="A post"><meta property="og:description" content="About it"></head>', {
          headers: { "content-type": "text/html" },
        })
      }
      return new Response("nope", { status: 404 })
    },
  })
  afterAll(() => server.stop(true))

  test("a paragraph that is only a URL becomes a card; links in sentences stay links", async () => {
    const url = new URL("/post", server.url).href
    const html = await renderMarkdown(`${url}\n\nRead ${url} later.`, "en-US", "x")
    expect(html).toContain(`<a class="link-card external" href="${url}" target="_blank" rel="noopener noreferrer"><span class="link-card-text"><strong>A post</strong>`)
    expect(html).toContain('<span class="link-card-desc">About it</span>')
    expect(html).toMatch(/Read <a href="[^"]+" target="_blank" rel="noopener noreferrer" class="external">/)
  })

  test("a page that cannot be read leaves the link as it is", async () => {
    const url = new URL("/missing", server.url).href
    const html = await renderMarkdown(url, "en-US", "x")
    expect(html).not.toContain("link-card")
    expect(html).toContain(`href="${url}"`)
  })
})
