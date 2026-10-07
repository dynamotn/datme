import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { compressToBase64 } from "lz-string"
import { parseDrawing, renderScene, DrawingError, type Scene } from "../src/lib/excalidraw"
import { getVault } from "../src/lib/vault"

const fixture = fs.readFileSync(path.join(import.meta.dir, "fixtures/vault/_assets/draw/Sketch.excalidraw.md"), "utf8")

describe("reading drawings", () => {
  test("the plugin's compressed scene, its text elements and embedded files", () => {
    const scene = parseDrawing(fixture)
    expect(scene.elements.map((e) => e.id)).toEqual(["box1", "lbl1", "arr1", "pic1"])
    expect(scene.elements.find((e) => e.id === "lbl1")!.text).toBe("Slip box")
    expect(scene.files["0f9d1c2b3a4e5f60718293a4b5c6d7e8f9012345"]).toEqual({ link: "wide.png" })
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
})

describe("drawing", () => {
  const scene: Scene = {
    background: "#ffffff",
    files: {},
    elements: [
      { id: "r", type: "rectangle", x: 10, y: 20, width: 100, height: 50, seed: 1, backgroundColor: "#a5d8ff", fillStyle: "solid" },
      { id: "t", type: "text", x: 10, y: 80, width: 100, height: 50, text: "a <b>\nc", fontSize: 16, textAlign: "center", angle: Math.PI / 2 },
      { id: "x", type: "frame", x: -500, y: -500, width: 2000, height: 2000 },
    ],
  }

  test("an SVG framed around what is drawn, frames left out, with Excalidraw's padding", () => {
    const svg = renderScene(scene)
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0.00 10.00 /)
    expect(svg).toContain('<rect x="0" y="10"')
    expect(svg).toContain('fill="#a5d8ff"')
  })

  test("text is escaped, one line per tspan, turned with its element", () => {
    const svg = renderScene(scene)
    expect(svg).toContain('<tspan x="50" y="10.00">a &lt;b&gt;</tspan><tspan x="50" y="30.00">c</tspan>')
    expect(svg).toContain('rotate(90.000 50 25)')
    expect(svg).toContain(`font-family="Excalifont, Virgil, 'Segoe UI Emoji', sans-serif"`)
  })

  test("the same seed draws the same lines", () => {
    expect(renderScene(scene)).toBe(renderScene(scene))
  })

  test("an empty drawing is an error, not an empty box", () => {
    expect(() => renderScene({ background: "#fff", files: {}, elements: [] })).toThrow("empty")
  })
})

describe("in the vault", () => {
  test("an embed without exported images is drawn, with its picture published as an asset", () => {
    const vault = getVault()
    const md = vault.byKey["vi-VN"].get("07_Project/Blog post")!.md
    expect(md).toMatch(/<span class="drawing generated" style="max-width:300px"><svg [^>]*role="img" aria-label="Sketch"/)
    expect(md).toContain('<image href="/assets/_assets/images/wide.png"')
    expect(md).toContain(">Slip box</tspan>")
    expect(vault.assets.has("_assets/draw/Sketch.excalidraw.md")).toBe(false)
  })

  test("drawings with exports still use them", () => {
    const md = getVault().byKey["vi-VN"].get("03_Atomic/Zettelkasten")!.md
    expect(md).toContain('<img class="drawing-light" src="/assets/_assets/draw/Flow.excalidraw.light.svg"')
  })
})
