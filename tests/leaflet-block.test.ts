import { describe, expect, test } from "bun:test"
import { parseLeafletBlock } from "../src/lib/leaflet-block"
import { renderMarkdown } from "../src/lib/markdown"

const notes: Record<string, { title: string; url: string; location?: [number, number]; description?: string }> = {
  hanoi: { title: "Hà Nội", url: "/places/hanoi", location: [21.0278, 105.8342], description: "Capital" },
  hue: { title: "Huế", url: "/places/hue", location: [16.4637, 107.5909] },
  nowhere: { title: "Nowhere", url: "/nowhere" },
}
const r = {
  note: (t: string) => notes[t.toLowerCase()],
  tagged: (tag: string) => (tag === "travel" ? [{ lat: 16.4637, lng: 107.5909, title: "Huế", url: "/places/hue" }] : []),
}

describe("leaflet blocks", () => {
  test("view, height and zoom as the plugin writes them", () => {
    const m = parseLeafletBlock("id: trip\nlat: 21.03\nlong: 105.85\nheight: 300\ndefaultZoom: 12\nminZoom: 1", r)
    expect(m).toMatchObject({ center: [21.03, 105.85], zoom: 12, height: "300px", markers: [] })
    expect(parseLeafletBlock("coordinates: [10.8, 106.7]\nheight: 60vh", r)).toMatchObject({ center: [10.8, 106.7], height: "60vh" })
  })

  test("markers from marker lines, files and tags, each place once", () => {
    const m = parseLeafletBlock(
      "marker: default, 21.0278, 105.8342, [[Hanoi]]\nmarker: cafe, 10.77, 106.70, https://example.com, Good coffee\nmarker: default, 1, 2\nmarkerFile: [[Hue]], [[Nowhere]]\nmarkerTag: #travel",
      r,
    )
    expect(m.markers).toEqual([
      { lat: 21.0278, lng: 105.8342, title: "Hà Nội", url: "/places/hanoi", description: "Capital" },
      { lat: 10.77, lng: 106.7, title: "Good coffee", url: "https://example.com" },
      { lat: 1, lng: 2, title: "1, 2", url: "" },
      { lat: 16.4637, lng: 107.5909, title: "Huế", url: "/places/hue" },
    ])
  })

  test("image maps are Obsidian-only", () => {
    expect(parseLeafletBlock("image: [[floor.png]]", r).unsupported).toEqual(["image"])
  })

  test("renders a map with a plain list of its places, from the vault's notes", async () => {
    const html = await renderMarkdown("```leaflet\nid: m\nmarkerFile: [[Niklas Luhmann]]\ndefaultZoom: 9\n```", "en-US", "x")
    expect(html).toMatch(/<figure class="leaflet-block"><div class="map-canvas" role="region" aria-label="Map" style="height:500px" data-map="\[\{(&quot;|&#x22;)lat(&quot;|&#x22;):52\.0302/)
    expect(html).toContain('data-zoom="9"')
    expect(html).toMatch(/<ul class="map-list"><li><a href="\/en-US\/06_Reference\/[^"]+" class="internal">/)
    expect(await renderMarkdown("```leaflet\nimage: [[floor.png]]\n```", "en-US", "x")).toContain("leaflet: image")
  })
})
