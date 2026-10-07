import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { compressToBase64 } from "lz-string"
import { parseDrawing, parseSelection, renderScene, textLinks, DrawingError, type Scene, type ExElement } from "../src/lib/excalidraw"
import { getVault } from "../src/lib/vault"

const fixture = fs.readFileSync(path.join(import.meta.dir, "fixtures/vault/_assets/draw/Sketch.excalidraw.md"), "utf8")
const scene = (elements: ExElement[], extra: Partial<Scene> = {}): Scene => ({ background: "#ffffff", files: {}, exportOptions: {}, elements, ...extra })

describe("reading drawings", () => {
  test("the plugin's compressed scene, its text elements, embedded files and export settings", () => {
    const s = parseDrawing(fixture)
    expect(s.elements.map((e) => e.id)).not.toContain("gone")
    expect(s.elements.find((e) => e.id === "lbl1")!.text).toBe("Slip box")
    expect(s.files["0f9d1c2b3a4e5f60718293a4b5c6d7e8f9012345"]).toEqual({ embed: { kind: "file", target: "wide.png" } })
    expect(s.files["1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b"]).toEqual({ embed: { kind: "latex", tex: "e^{i\\pi} + 1 = 0" } })
    expect(s.exportOptions).toEqual({ transparent: false, dark: false, padding: 20 })
  })

  test("plain JSON, in a ```json block or a .excalidraw file", () => {
    const json = JSON.stringify({ elements: [{ id: "a", type: "ellipse", x: 0, y: 0, width: 10, height: 10 }], appState: { viewBackgroundColor: "#fff9db" } })
    expect(parseDrawing("# Drawing\n```json\n" + json + "\n```").background).toBe("#fff9db")
    expect(parseDrawing(json).elements).toHaveLength(1)
    expect(parseDrawing("```compressed-json\n" + compressToBase64(json) + "\n```").elements).toHaveLength(1)
  })

  test("what is not a drawing is said so", () => {
    expect(() => parseDrawing("# Just a note")).toThrow(DrawingError)
    expect(() => parseDrawing("```json\n{oops\n```")).toThrow("not valid JSON")
  })

  test("parts of a drawing in the plugin's syntax", () => {
    expect(parseSelection("^frame=abc")).toEqual({ kind: "frame", id: "abc" })
    expect(parseSelection("^clippedframe=abc")).toEqual({ kind: "clippedframe", id: "abc" })
    expect(parseSelection("^group=abc")).toEqual({ kind: "group", id: "abc" })
    expect(parseSelection("^abc")).toEqual({ kind: "area", id: "abc" })
    expect(parseSelection("Overview")).toEqual({ kind: "frameName", name: "Overview" })
    expect(parseSelection("")).toBeUndefined()
  })

  test("links in text, with what a reader sees of them", () => {
    expect(textLinks("See [[Notes/Luhmann|him]], [[Zettel]] or [site](https://x.example).")).toEqual([
      { text: "See " },
      { text: "him", target: "Notes/Luhmann" },
      { text: ", " },
      { text: "Zettel", target: "Zettel" },
      { text: " or " },
      { text: "site", target: "https://x.example" },
      { text: "." },
    ])
  })
})

describe("drawing", () => {
  const basic = scene([
    { id: "r", type: "rectangle", x: 10, y: 20, width: 100, height: 50, seed: 1, backgroundColor: "#a5d8ff", fillStyle: "solid" },
    { id: "t", type: "text", x: 10, y: 80, width: 100, height: 50, text: "a <b>\nc", fontSize: 16, textAlign: "center", angle: Math.PI / 2 },
  ])

  test("an SVG framed around what is drawn, with Excalidraw's padding", () => {
    const svg = renderScene(basic)
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0.00 10.00 /)
    expect(svg).toContain('<rect x="0" y="10"')
    expect(svg).toContain('fill="#a5d8ff"')
  })

  test("text is escaped, one line per tspan, turned with its element", () => {
    const svg = renderScene(basic)
    expect(svg).toContain('<tspan x="50" y="10.00" dominant-baseline="middle">a &lt;b&gt;</tspan><tspan x="50" y="30.00" dominant-baseline="middle">c</tspan>')
    expect(svg).toContain("rotate(90.000 50 25)")
    expect(svg).toContain(`font-family="Excalifont, Virgil, 'Segoe UI Emoji', sans-serif"`)
  })

  test("the same seed draws the same lines", () => {
    expect(renderScene(basic)).toBe(renderScene(basic))
  })

  test("an empty drawing is an error, not an empty box", () => {
    expect(() => renderScene(scene([]))).toThrow("empty")
  })

  test("links on elements and in text lead where the resolver says; unknown ones stay text", () => {
    const svg = renderScene(
      scene([
        { id: "r", type: "rectangle", x: 0, y: 0, width: 10, height: 10, link: "[[Home]]" },
        { id: "t", type: "text", x: 0, y: 20, width: 100, height: 20, text: "go [[Home|home]] or [[Nowhere]]" },
      ]),
      { resolveLink: (t) => (t === "Home" ? "/home" : undefined) },
    )
    expect(svg).toMatch(/<a href="\/home" class="drawing-link" aria-label="Home"><g transform="translate\(0 0\)"/)
    expect(svg).toContain('role="group"')
    expect(svg).toContain('<a href="/home" class="drawing-link"><tspan dominant-baseline="middle">home</tspan></a><tspan dominant-baseline="middle"> or </tspan><tspan dominant-baseline="middle">Nowhere</tspan>')
  })

  test("export settings: transparent, dark, padding", () => {
    const r = { id: "r", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }
    expect(renderScene(scene([r], { exportOptions: { transparent: true } }))).not.toContain('fill="#ffffff"')
    expect(renderScene(scene([r], { exportOptions: { dark: true } }))).toContain('role="img" data-dark=""')
    expect(renderScene(scene([r], { exportOptions: { padding: 0 } }))).toContain('viewBox="')
    expect(renderScene(scene([r], { exportOptions: { padding: 0 } }))).toMatch(/viewBox="-?0\.\d\d -?0\.\d\d/)
  })

  test("every Excalidraw arrowhead draws", () => {
    for (const head of ["arrow", "bar", "dot", "circle_outline", "triangle", "triangle_outline", "diamond", "diamond_outline", "crowfoot_one", "crowfoot_many", "crowfoot_one_or_many"]) {
      const svg = renderScene(scene([{ id: "a", type: "arrow", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]], endArrowhead: head }]))
      expect(svg.match(/<path /g)!.length).toBeGreaterThan(1)
    }
  })
})

describe("frames and parts", () => {
  const s = parseDrawing(fixture)

  test("frames are outlined, named, and clip what they hold", () => {
    const svg = renderScene(s)
    expect(svg).toContain('<g class="drawing-frame"><rect x="-20" y="-20" width="240" height="130" rx="8"')
    expect(svg).toContain(">Overview</text>")
    expect(svg).toMatch(/<clipPath id="ex-f-frame1"><rect x="-20" y="-20" width="240" height="130"\/><\/clipPath>/)
    expect(svg).toMatch(/<g clip-path="url\(#ex-f-frame1\)"><g transform="translate\(200 60\)"/)
  })

  test("a frame by name or id shows what it holds, without its outline", () => {
    for (const select of [{ kind: "frameName" as const, name: "overview" }, { kind: "frame" as const, id: "frame1" }]) {
      const svg = renderScene(s, { select })
      expect(svg).not.toContain("drawing-frame")
      expect(svg).toContain(">Slip box</tspan>")
      expect(svg).not.toContain("Luhmann")
    }
  })

  test("a clipped frame is exactly the frame, overflow cut", () => {
    const svg = renderScene(s, { select: { kind: "clippedframe", id: "frame1" } })
    expect(svg).toContain('viewBox="-20.00 -20.00 240.00 130.00"')
    expect(svg).toContain('clip-path="url(#ex-f-frame1)"')
  })

  test("a group shows its members; an area shows what lies around an element", () => {
    const group = renderScene(s, { select: { kind: "group", id: "g1" } })
    expect(group.match(/<g transform=/g)).toHaveLength(2)
    const area = renderScene(s, { select: { kind: "area", id: "box1" } })
    expect(area).toContain('viewBox="-20.00 -20.00 220.00 120.00"')
  })

  test("unknown parts are errors", () => {
    expect(() => renderScene(s, { select: { kind: "frameName", name: "Nope" } })).toThrow('no frame named "Nope"')
    expect(() => renderScene(s, { select: { kind: "group", id: "nope" } })).toThrow('no element "nope"')
  })
})

describe("in the vault", () => {
  const vault = getVault()
  const md = vault.byKey["vi-VN"].get("07_Project/Blog post")!.md

  test("an embed without exported images is drawn; its pictures are published as assets", () => {
    expect(md).toMatch(/<span class="drawing generated" style="max-width:300px"><svg [^>]*role="group" aria-label="Sketch"/)
    expect(md).toContain('<image href="/assets/_assets/images/wide.png" width="1200" height="600"/>')
    expect(vault.assets.has("_assets/draw/Sketch.excalidraw.md")).toBe(false)
  })

  test("links in the drawing lead to published notes and count as links of the note", () => {
    expect(md).toMatch(/<a href="\/03_Atomic\/Zettelkasten" class="drawing-link" aria-label="Zettelkasten"><g /)
    expect(md).toContain('<a href="/06_Reference/Niklas-Luhmann" class="drawing-link"><tspan dominant-baseline="middle">Luhmann</tspan></a>')
    // A private note's link stays plain text, as everywhere else.
    expect(md).toContain('<tspan dominant-baseline="middle">Private</tspan>')
    const back = vault.backlinks["vi-VN"].get("06_Reference/Niklas Luhmann") ?? []
    expect(back.map((b) => b.note.key)).toContain("07_Project/Blog post")
  })

  test("the SVG reaches the page untouched by the markdown passes", () => {
    expect(md).toContain('clip-path="url(#ex-')
    expect(md).not.toMatch(/url\(<a /)
  })

  test("embedded drawings, notes and formulas", () => {
    // Inner.excalidraw, drawn inside.
    expect(md).toContain('fill="#ffec99"')
    expect(md).toMatch(/<a href="\/07_Project\/Blog-post" class="drawing-link"><rect [^>]*\/><text [^>]*>📄 Blog post<\/text><\/a>/)
    expect(md).toMatch(/<foreignObject width="200" height="60"><div xmlns="http:\/\/www.w3.org\/1999\/xhtml"[^>]*><span class="katex"><math/)
  })

  test("a frame embedded by name", () => {
    const frames = md.match(/<span class="drawing generated"><svg [^>]*>/g) ?? []
    expect(frames).toHaveLength(1)
    expect(md).not.toMatch(/<span class="drawing generated"><svg[\s\S]*?Luhmann[\s\S]*?<\/svg>/)
  })

  test("drawings with exports still use them", () => {
    const zettel = vault.byKey["vi-VN"].get("03_Atomic/Zettelkasten")!.md
    expect(zettel).toContain('<img class="drawing-light" src="/assets/_assets/draw/Flow.excalidraw.light.svg"')
  })
})
