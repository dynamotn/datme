import { describe, expect, test } from "bun:test"
import { preprocess, anchorOf, urlPlaceholder, type LinkTarget } from "../src/lib/obsidian"

const target: LinkTarget = { key: "06_Reference/Target" }
const notes: Record<string, LinkTarget> = {
  target,
  "06_reference/target": target,
  "06_reference/target.md": target,
}
const assets: Record<string, string> = { "pic.png": "_assets/images/pic.png", "doc.pdf": "_assets/doc.pdf", "map.canvas": "07_Project/Map.canvas" }

const run = (src: string) =>
  preprocess(src, {
    lang: "vi-VN",
    dir: "03_Atomic",
    resolveNote: (t) => notes[t.toLowerCase().replace(/^\.\.\//, "")],
    resolveAsset: (t) => assets[t.split("/").pop()!.toLowerCase()],
  })

const url = urlPlaceholder("06_Reference/Target")

describe("wikilinks", () => {
  test("resolve to an internal link with the note key", () => {
    const { md, links } = run("See [[Target]].")
    expect(md).toContain(`<a href="${url}" class="internal" data-key="06_Reference/Target">Target</a>`)
    expect(links).toEqual([{ key: "06_Reference/Target", context: "See Target." }])
  })

  test("use the alias and the heading anchor", () => {
    const { md } = run("[[Target#Some Heading|the alias]]")
    expect(md).toContain(`href="${url}#some-heading"`)
    expect(md).toContain(">the alias</a>")
  })

  test("accept the escaped pipe used inside tables", () => {
    const { md } = run("| [[Target\\|alias]] |")
    expect(md).toContain(">alias</a>")
    expect(md).not.toContain("\\|")
  })

  test("same-note anchors stay on the page", () => {
    expect(run("[[#Intro|go]]").md).toContain('<a href="#intro" class="internal anchor">go</a>')
  })

  test("unpublished targets become plain text and are not counted as links", () => {
    const { md, links } = run("[[Private note]]")
    expect(md).toContain('<span class="broken-link" title="Not published">Private note</span>')
    expect(links).toHaveLength(0)
  })
})

describe("embeds", () => {
  test("note embeds become transclusion placeholders", () => {
    const { md } = run("![[Target#Part]]")
    expect(md).toBe('<span class="transclude-ph" data-key="06_Reference/Target" data-fragment="Part"></span>')
  })

  test("images get the asset URL and an optional width", () => {
    const { md, assets: used } = run("![[pic.png|300]]")
    expect(md).toBe('<img src="/assets/_assets/images/pic.png" alt="" width="300" loading="lazy">')
    expect(used).toEqual(["_assets/images/pic.png"])
  })

  test("pdf embeds become an iframe", () => {
    expect(run("![[doc.pdf]]").md).toContain('<iframe class="pdf" src="/assets/_assets/doc.pdf"')
  })
})

describe("markdown links", () => {
  test("relative .md links resolve like wikilinks", () => {
    const { md, links } = run("[text](../06_Reference/Target.md)")
    expect(md).toContain(`href="${url}"`)
    expect(links[0].key).toBe("06_Reference/Target")
  })

  test("external links are left alone", () => {
    expect(run("[x](https://example.com)").md).toBe("[x](https://example.com)")
  })

  test("links to canvases and drawings open their pages, as wikilinks do", () => {
    const canvas = run("[the map](Map.canvas)")
    expect(canvas.md).toBe('<a href="/07_Project/Map.canvas" class="internal doc">the map</a>')
    expect(canvas.docs).toEqual(["07_Project/Map.canvas"])
    const drawing = preprocess("[plan](Plan.excalidraw)", {
      lang: "vi-VN",
      dir: "",
      resolveNote: () => undefined,
      resolveAsset: () => undefined,
      drawingPage: () => "Plan.excalidraw.md",
    })
    expect(drawing.md).toBe('<a href="/Plan.excalidraw" class="internal doc">plan</a>')
  })
})

describe("inline syntax", () => {
  test("highlights, comments, inline tags and block ids", () => {
    const { md } = run("A ==mark== %%hidden%% #topic/sub end ^block-1")
    expect(md).toContain("<mark>mark</mark>")
    expect(md).not.toContain("hidden")
    expect(md).toContain('<a href="/tags/topic/sub" class="tag-link">#topic/sub</a>')
    expect(md).toContain('<span class="block-id" id="^block-1"></span>')
  })

  test("headings are not mistaken for tags", () => {
    expect(run("# Title").md).toBe("# Title")
  })

  test("html comments are removed", () => {
    expect(run("a <!-- query --> b").md).toBe("a  b")
  })
})

describe("code is never rewritten", () => {
  test("fenced blocks keep wikilinks, highlights and tags verbatim", () => {
    const src = "```js\nconst x = '[[Target]] ==y== #tag %%z%%'\n```"
    expect(run(src).md).toBe(src)
  })

  test("inline code and display math are masked too", () => {
    expect(run("`[[Target]]`").md).toBe("`[[Target]]`")
    const math = "$$\n==a== [[Target]]\n$$"
    expect(run(math).md).toBe(math)
  })
})

describe("anchorOf", () => {
  test("slugs headings and keeps block ids", () => {
    expect(anchorOf("Some Heading!")).toBe("#some-heading")
    expect(anchorOf("^abc")).toBe("#^abc")
    expect(anchorOf("")).toBe("")
  })
})

describe("excalidraw", () => {
  const drawings: Record<string, string> = {
    "Flow.excalidraw.light.svg": "_assets/draw/Flow.excalidraw.light.svg",
    "Flow.excalidraw.dark.svg": "_assets/draw/Flow.excalidraw.dark.svg",
    "Sketch.excalidraw.png": "_assets/draw/Sketch.excalidraw.png",
  }
  const draw = (src: string) =>
    preprocess(src, {
      lang: "vi-VN",
      dir: "",
      resolveNote: () => undefined,
      resolveAsset: (t) => drawings[t.split("/").pop()!],
    })

  test("light and dark exports follow the site theme", () => {
    const { md, assets: used } = draw("![[Flow.excalidraw]]")
    expect(md).toContain('class="drawing-light" src="/assets/_assets/draw/Flow.excalidraw.light.svg"')
    expect(md).toContain('class="drawing-dark" src="/assets/_assets/draw/Flow.excalidraw.dark.svg"')
    expect(used).toHaveLength(2)
  })

  test("a single export, the .md suffix and a width are understood", () => {
    expect(draw("![[Sketch.excalidraw.md|400]]").md).toBe(
      '<span class="drawing" style="max-width:400px"><img class="" src="/assets/_assets/draw/Sketch.excalidraw.png" alt="Sketch" loading="lazy"></span>',
    )
  })

  test("drawings that were never exported explain how to publish them", () => {
    expect(draw("![[Nope.excalidraw]]").md).toContain('class="drawing-missing"')
  })
})
