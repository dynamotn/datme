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

/** The HTML a block embed's placeholder holds, as the renderer opens it out. */
const opened = (md: string) => {
  const m = md.match(/^<span class="block-embed" data-html="([^"]*)"><\/span>$/)
  expect(m).not.toBeNull()
  return m![1].replace(/&#10;/g, "\n").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
}


describe("wikilinks", () => {
  test("resolve to an internal link with the note key", () => {
    const { md, links } = run("See [[Target]].")
    expect(md).toContain(`<a href="${url}" class="internal" data-key="06_Reference/Target">Target</a>`)
    expect(links).toEqual([{ key: "06_Reference/Target", context: "See Target." }])
  })

  test("a link's context is its own line, code included", () => {
    const { links } = run("First [[Target|one]] line with a long wikilink.\n\nUses `x` then [two](06_Reference/Target.md).")
    expect(links.map((l) => l.context)).toEqual(["First one line with a long wikilink.", "Uses x then two."])
  })

  test("a stray backtick does not hide the links of the paragraphs after it", () => {
    const { links } = run("Press the ` key.\n\nSee [[Target]].\n\nThen run `ls`.")
    expect(links.map((l) => l.key)).toEqual(["06_Reference/Target"])
    expect(run("Code `[[Target]]\nstill code` here.").links).toEqual([])
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
    expect(md).toBe('<span class="image-embed"><img src="/assets/_assets/images/pic.png" alt="" width="300" loading="lazy"></span>')
    expect(used).toEqual(["_assets/images/pic.png"])
  })

  test("pdf embeds become an iframe", () => {
    expect(opened(run("![[doc.pdf]]").md)).toBe('<iframe class="pdf" src="/assets/_assets/doc.pdf" loading="lazy"></iframe>')
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

  test("a colour emoji after == colours the highlight and is not shown", () => {
    const { md } = run("==🔴Important== ==🟠a== ==🟡b== ==🟢c== ==🔵 d== ==🟣e== ==plain 🔴==")
    expect(md).toBe(
      '<mark class="mark-red">Important</mark> <mark class="mark-orange">a</mark> <mark class="mark-yellow">b</mark> <mark class="mark-green">c</mark> <mark class="mark-blue">d</mark> <mark class="mark-purple">e</mark> <mark>plain 🔴</mark>',
    )
  })

  test("headings are not mistaken for tags", () => {
    expect(run("# Title").md).toBe("# Title")
  })

  test("html comments lose their words", () => {
    expect(run("a <!-- query --> b").md).toBe("a <!----> b")
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

describe("obsidian flavoured details", () => {
  test("a wikilink reads as Obsidian shows it: no .md, its heading after a >", () => {
    expect(run("[[06_Reference/Target.md]]").md).toContain(">Target</a>")
    expect(run("[[Target#Some Heading]]").md).toContain(">Target > Some Heading</a>")
    expect(run("[[Target#A#B]]").md).toContain(">Target > A > B</a>")
    expect(run("[[Target|]]").md).toContain(">Target</a>")
  })

  test("a markdown link may put its target in angle brackets, spaces and all", () => {
    expect(run("[t](<06_Reference/Target.md>)").md).toContain(`<a href="${url}" class="internal"`)
    expect(run("[t](<06_Reference/Target.md#Some Heading>)").md).toContain(`href="${url}#some-heading"`)
    expect(run("![](<pic.png>)").md).toContain('<img src="/assets/_assets/images/pic.png"')
  })

  test("an encoded heading of a markdown link gets the same anchor as the heading", () => {
    expect(run("[t](06_Reference/Target.md#Some%20Heading)").md).toContain(`href="${url}#some-heading"`)
  })

  test("a pdf embed opens at its page and takes its height", () => {
    expect(opened(run("![[doc.pdf#page=3]]").md)).toContain('src="/assets/_assets/doc.pdf#page=3"')
    expect(opened(run("![[doc.pdf#height=400]]").md)).toContain('style="height:400px"')
  })

  test("an escaped == or [[ stays as written", () => {
    const { md, links } = run("\\==not\\== and \\[[Target]]")
    expect(md).not.toContain("<mark>")
    expect(links).toEqual([])
  })

  test("a highlight may hold a single =", () => {
    expect(run("==a=b==").md).toBe("<mark>a=b</mark>")
  })

  test("inline footnotes become footnotes defined at the end", () => {
    const { md } = run("Text^[a note with [[Target|a link]]] and on.")
    expect(md).toMatch(/^Text\[\^datme-inline-1\] and on\.\n\n\[\^datme-inline-1\]: a note with <a [^>]+>a link<\/a>\n$/)
    expect(run("x^[ unclosed").md).toBe("x^[ unclosed")
    expect(run("`^[code]`").md).toBe("`^[code]`")
  })

  test("inline math is left alone, and a lone dollar is a dollar", () => {
    expect(run("$a^[1]$ and $x==y==z$").md).toBe("$a^[1]$ and $x==y==z$")
    expect(run("$5 and ==hl== $10").md).toBe("&#36;5 and <mark>hl</mark> &#36;10")
    expect(run("<pre>$5</pre>").md).toBe("<pre>&#36;5</pre>")
    expect(run("see https://x.test/$y").md).toBe("see https://x.test/$y")
    expect(run("a $$y$$ b").md).toBe("a $$y$$ b")
  })

  test("indented code stays as written, the next paragraph of a list item does not", () => {
    expect(run("Text\n\n    [[Target]] ==y== #tag").md).toBe("Text\n\n    [[Target]] ==y== #tag")
    expect(run("- item\n\n    [[Target]] after").md).toContain(`<a href="${url}"`)
  })

  test("a link to a heading is not a tag, and a comment keeps its place but not its words", () => {
    expect(run("[go](#part) and (#tag)").md).toBe('[go](#part) and (<a href="/tags/tag" class="tag-link">#tag</a>)')
    expect(run("- a\n\n<!-- private -->\n\n- b").md).toBe("- a\n\n<!---->\n\n- b")
  })

  test("a block id on a line of its own is kept for the block before it", () => {
    expect(run("- a\n\n^list-id").md).toBe('- a\n\n<span class="block-id" id="^list-id"></span>')
  })
})
