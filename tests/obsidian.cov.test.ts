import { describe, expect, test } from "bun:test"
import { preprocess, urlPlaceholder, type LinkTarget } from "../src/lib/obsidian"

const target: LinkTarget = { key: "Notes/Target" }
const assets: Record<string, string> = {
  "pic.png": "_assets/pic.png",
  "bundle.zip": "_assets/bundle.zip",
  "board.canvas": "_assets/board.canvas",
  "talk.mp3": "_assets/talk.mp3",
  "talk.vtt": "_assets/talk.vtt",
  "clip.mp4": "_assets/clip.mp4",
  "clip.srt": "_assets/clip.srt",
}

type Remote = { url: string; title: string } | null | { home: string } | undefined
const gardens: Record<string, Record<string, Remote>> = {
  friend: { Known: { url: "https://friend.example/known", title: "Known note" }, Gone: null },
  offline: { Any: { home: "https://offline.example/" } },
}

const run = (src: string, extra: Partial<Parameters<typeof preprocess>[1]> = {}) =>
  preprocess(src, {
    lang: "en-US",
    dir: "Notes",
    resolveNote: (t) => (t.toLowerCase().replace(/\.md$/, "") === "target" ? target : undefined),
    resolveAsset: (t) => assets[t.split("/").pop()!.toLowerCase()],
    privateLink: (t, _dir, alias) => (t.replace(/\.md$/, "") === "Secret" ? (alias ?? "a private note") : undefined),
    gardenLink: (name, t) => gardens[name]?.[t],
    ...extra,
  })

describe("attachments and assets", () => {
  test("an embedded file that is neither picture, media nor PDF becomes a download link", () => {
    const { md, assets: used } = run("![[bundle.zip]] and ![[bundle.zip|the bundle]]")
    expect(md).toContain('<a href="/assets/_assets/bundle.zip" class="attachment">bundle.zip</a>')
    expect(md).toContain('<a href="/assets/_assets/bundle.zip" class="attachment">the bundle</a>')
    expect(used).toEqual(["_assets/bundle.zip", "_assets/bundle.zip"])
  })

  test("a wikilink to an asset links to the file", () => {
    const { md, assets: used, problems } = run("Get [[bundle.zip|it here]].")
    expect(md).toContain('<a href="/assets/_assets/bundle.zip" class="attachment">it here</a>')
    expect(used).toEqual(["_assets/bundle.zip"])
    expect(problems).toEqual([])
  })

  test("a markdown link to an asset links to the file; to a canvas, to its page", () => {
    const { md, assets: used, docs } = run("[zip](bundle.zip) and [the board](board.canvas)")
    expect(md).toContain('<a href="/assets/_assets/bundle.zip" class="attachment">zip</a>')
    expect(md).toMatch(/<a href="[^"]*board\.canvas" class="internal doc">the board<\/a>/)
    expect(used).toEqual(["_assets/bundle.zip"])
    expect(docs).toEqual(["_assets/board.canvas"])
  })

  test("a raw <img> with a relative source points at the published asset; an unknown one is left alone", () => {
    const { md, assets: used } = run('<img src="pic.png" width="10"> <img src=\'nowhere.png\'>')
    expect(md).toContain('<img src="/assets/_assets/pic.png" width="10">')
    expect(md).toContain("<img src='nowhere.png'>")
    expect(used).toEqual(["_assets/pic.png"])
  })

  test("a markdown link whose target is not valid percent-encoding is taken as written", () => {
    const { md, problems } = run("[half](50%zz.md)")
    expect(md).toContain('<span class="broken-link">half</span>')
    expect(problems).toEqual([{ kind: "link", target: "50%zz.md" }])
  })
})

describe("private notes", () => {
  test("an embed of a private note shows its words, not a broken embed", () => {
    const { md, problems } = run("![[Secret|that draft]]")
    expect(md).toContain('<span class="broken-link" title="Not published">that draft</span>')
    expect(problems).toEqual([{ kind: "embed", target: "Secret", shown: "that draft" }])
  })

  test("an embed of a missing note that is not private is broken", () => {
    const { md, problems } = run("![[Nowhere|<x>]]")
    expect(md).toBe('<span class="broken-link">&lt;x&gt;</span>')
    expect(problems).toEqual([{ kind: "embed", target: "Nowhere" }])
  })

  test("an embed of a private note reports its words as written", () => {
    const { md, problems } = run("![[Secret|the <draft>]]")
    expect(md).toContain('<span class="broken-link" title="Not published">the &lt;draft&gt;</span>')
    expect(problems).toEqual([{ kind: "embed", target: "Secret", shown: "the <draft>" }])
  })
})

describe("garden links", () => {
  test("a known note of a neighbour links to it, with its title or the alias", () => {
    const { md } = run("[[friend:Known]] and [[friend:Known#Part|that]]")
    expect(md).toContain('<a href="https://friend.example/known" class="garden-link" data-garden="friend" rel="noopener">Known note</a>')
    expect(md).toContain('<a href="https://friend.example/known#part" class="garden-link" data-garden="friend" rel="noopener">that</a>')
  })

  test("a note the neighbour does not have is broken; one of an unknown index links to its home", () => {
    const { md, problems } = run("[[friend:Gone]] then [[offline:Any]]")
    expect(md).toContain('<span class="broken-link" title="Not in friend">Gone</span>')
    expect(md).toContain('<a href="https://offline.example/" class="garden-link" data-garden="offline" rel="noopener">Any</a>')
    expect(problems).toEqual([{ kind: "garden", target: "friend:Gone" }])
  })
})

describe("media with transcripts", () => {
  const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello there\n"
  const srt = "1\n00:00:01,000 --> 00:00:02,000\nSubRip line\n"
  const texts: Record<string, string> = { "_assets/talk.vtt": vtt, "_assets/clip.srt": srt }

  test("audio shows its transcript next to the player", () => {
    const { md } = run("![[talk.mp3]]", { readText: (rel) => texts[rel] })
    expect(md).toContain("block-embed")
    expect(md).toContain("media-transcript")
    expect(md).toContain("Hello there")
  })

  test("video with a SubRip sidecar gets captions built from its cues", () => {
    const { md, assets: used } = run("![[clip.mp4]]", { readText: (rel) => texts[rel] })
    expect(md).toContain("data-captions-from-cues")
    expect(md).toContain("SubRip line")
    expect(used).not.toContain("_assets/clip.srt")
  })

  test("video with a WebVTT sidecar gets a captions track", () => {
    const withVtt = { resolveAsset: (t: string) => ({ "clip.mp4": "_assets/clip.mp4", "_assets/clip.vtt": "_assets/clip.vtt" })[t.toLowerCase()] }
    const { md, assets: used } = run("![[clip.mp4]]", { ...withVtt, readText: () => vtt })
    expect(md).toContain("&lt;track kind=&quot;captions&quot; src=&quot;/assets/_assets/clip.vtt&quot;")
    expect(used).toContain("_assets/clip.vtt")
  })

  test("a sidecar that cannot be read leaves a plain player", () => {
    const { md } = run("![[talk.mp3]]", { readText: () => undefined })
    expect(md).toBe('<audio src="/assets/_assets/talk.mp3" controls></audio>')
  })

  test("without readText no transcript is looked for", () => {
    const { md } = run("![[talk.mp3]]")
    expect(md).toBe('<audio src="/assets/_assets/talk.mp3" controls></audio>')
  })
})

describe("drawings, canvases and bases", () => {
  const drawn = { svg: '<svg role="img"><a href="#">x</a></svg>', assets: ["_assets/inner.png"], links: ["Notes/Target"], rel: "Draw/Flow.excalidraw.md" }
  const drawCtx = {
    drawDrawing: (file: string) => (file.startsWith("Flow") ? drawn : undefined),
    drawingPage: (file: string) => (file.startsWith("Flow") ? "Draw/Flow.excalidraw.md" : undefined),
  }

  test("a drawing without an export is drawn, its files and links counted as the note's", () => {
    const { md, assets: used, links } = run("See ![[Flow.excalidraw|300]] here", drawCtx)
    expect(md).toContain('<span class="drawing generated" style="max-width:300px">')
    expect(md).toContain('role="img" aria-label="Flow"')
    expect(used).toEqual(["_assets/inner.png"])
    expect(links).toEqual([{ key: "Notes/Target", context: "See 300 here" }])
  })

  test("a drawing that cannot be drawn is reported", () => {
    const { md, problems } = run("![[Lost.excalidraw]]", drawCtx)
    expect(md).toContain('<span class="drawing-missing">✏️ Lost: the drawing cannot be found or read</span>')
    expect(problems).toEqual([{ kind: "drawing", target: "Lost.excalidraw" }])
  })

  test("a link to a drawing opens its page; to a missing one, it is broken", () => {
    const { md, docs, problems } = run("[[Flow.excalidraw|the flow]] [[Lost.excalidraw]] [md](Flow.excalidraw) [gone](Lost.excalidraw)", drawCtx)
    expect(md).toContain('<a href="/en-US/Draw/Flow.excalidraw" class="internal doc">the flow</a>')
    expect(md).toContain('<span class="broken-link">Lost</span>')
    expect(md).toContain('<a href="/en-US/Draw/Flow.excalidraw" class="internal doc">md</a>')
    // A markdown link to a drawing that is nowhere is a broken link to a file.
    expect(md).toContain("[gone](Lost.excalidraw)")
    expect(docs).toEqual(["Draw/Flow.excalidraw.md", "Draw/Flow.excalidraw.md"])
    expect(problems).toEqual([
      { kind: "link", target: "Lost.excalidraw" },
      { kind: "link", target: "Lost.excalidraw" },
    ])
  })

  test("canvases and bases: embeds, links and missing ones", () => {
    const docsOf: Record<string, string> = { "board.canvas": "_assets/board.canvas", "list.base": "_assets/list.base" }
    const { md, docs, problems } = run("![[board.canvas]] ![[list.base#Table]] [[board.canvas|Board]] ![[gone.canvas]]", {
      resolveAsset: (t: string) => docsOf[t.toLowerCase()],
    })
    expect(md).toMatch(/<a class="doc-card internal" href="[^"]*">🗂️ board<\/a>/)
    expect(md).toContain('<span class="base-ph" data-rel="_assets/list.base" data-view="Table"></span>')
    expect(md).toMatch(/<a href="[^"]*" class="internal doc">Board<\/a>/)
    expect(md).toContain('<span class="broken-link">gone</span>')
    expect(docs).toEqual(["_assets/board.canvas", "_assets/list.base", "_assets/board.canvas"])
    expect(problems).toEqual([{ kind: "embed", target: "gone.canvas" }])
  })
})

describe("pictures", () => {
  test("a size alias sets width and height; in a deck it becomes Marp's alt text", () => {
    expect(run("![[pic.png|120x80]]").md).toContain('<img src="/assets/_assets/pic.png" alt="" width="120" height="80" loading="lazy">')
    expect(run("![[pic.png|120]]").md).toContain('alt="" width="120" loading="lazy"')
    expect(run("![[pic.png|120x80]]", { slides: true }).md).toBe("![w:120 h:80](/assets/_assets/pic.png)")
    expect(run("![[pic.png|a cat]]", { slides: true }).md).toBe("![a cat](/assets/_assets/pic.png)")
  })
})

describe("blocks of their own", () => {
  test("a multi-column region reads its settings from the masked code block", () => {
    const src = [
      "--- start-multi-column: Two",
      "```column-settings",
      "Number of Columns: 2",
      "```",
      "Left [[Target]]",
      "--- column-break ---",
      "Right",
      "--- end-multi-column",
    ].join("\n")
    const { md, links } = run(src)
    expect(md).toContain('<div class="columns" style="grid-template-columns:repeat(2, minmax(0, 1fr))">')
    expect(md).not.toContain("column-settings")
    expect(links.map((l) => l.key)).toEqual(["Notes/Target"])
  })

  test("a ```tabs block becomes tabs whose content is converted", () => {
    const { md, links } = run("```tabs\n--- One\n[[Target]]\n--- Two\nplain\n```")
    expect(md).toContain('<div class="tabs" data-tabs>')
    expect(links.map((l) => l.key)).toEqual(["Notes/Target"])
  })

  test("a deck keeps its directives and styles untouched", () => {
    const src = "<!-- _class: lead #tag ==x== -->\n<style>section { color: red } #id {}</style>\n==hl== #tag"
    const { md } = run(src, { slides: true })
    expect(md).toContain("<!-- _class: lead #tag ==x== -->")
    expect(md).toContain("<style>section { color: red } #id {}</style>")
    expect(md).toContain("<mark>hl</mark>")
  })

  test("an image of a video page becomes its player; any other stays an image", () => {
    const { md } = run("![talk](https://www.youtube.com/watch?v=dQw4w9WgXcQ) ![pic](https://example.com/a.png)")
    expect(md).toContain("youtube")
    expect(md).toContain("dQw4w9WgXcQ")
    expect(md).not.toContain("![talk]")
  })
})

test("a link to a note still resolves next to the new branches", () => {
  const { md } = run("[[Target]]")
  expect(md).toContain(urlPlaceholder("Notes/Target"))
})
