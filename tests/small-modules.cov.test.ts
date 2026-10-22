import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ChartError, parseChart, renderChart } from "../src/lib/charts"
import { decks, hasDecks } from "../src/lib/decks"
import { hasJournal, journal } from "../src/lib/journal"
import { inlineAssets, mediaType } from "../src/lib/inline-assets"
import { renderLeafletBlock, vaultResolver } from "../src/lib/leaflet-block"
import { listed, getVault } from "../src/lib/vault"
import { site } from "../src/site.config"

const tmpRoot = os.tmpdir()
fs.mkdirSync(tmpRoot, { recursive: true })
const tmp = fs.mkdtempSync(path.join(tmpRoot, "small-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe("charts", () => {
  test("an error that is not the chart's own is not hidden as a chart message", () => {
    // A label that cannot become text breaks the renderer itself, not the chart's YAML.
    const src = "labels:\n  - toString: 1\nseries:\n  - data: [1]"
    expect(() => parseChart(src)).toThrow(TypeError)
    expect(() => renderChart(src)).toThrow(TypeError)
  })

  test("the chart's own errors become a message", () => {
    expect(() => parseChart("type: bar\nlabels: [a]\nseries: []")).toThrow(ChartError)
    expect(renderChart("type: gantt\nlabels: []\nseries: [{data: []}]")).toBe('<p class="dataview dv-error">Chart: unknown chart type &quot;gantt&quot;</p>')
  })
})

describe("flashcard decks", () => {
  test("listed, unprotected decks only", () => {
    for (const lang of site.langs) {
      const want = listed(lang).filter((n) => n.deck && !n.protected)
      expect(decks(lang)).toEqual(want)
      expect(hasDecks(lang)).toBe(want.length > 0)
    }
    expect(decks("en-US").length).toBeGreaterThan(0)
  })
})

describe("the journal", () => {
  test("a language has a journal when it has daily notes", () => {
    expect(hasJournal("en-US")).toBe(true)
    expect(hasJournal("en-US")).toBe(journal("en-US").length > 0)
  })
})

describe("leaflet maps of the vault", () => {
  const luhmann = getVault().byKey["en-US"].get("06_Reference/Niklas Luhmann")!

  test("a tag puts every located, published note carrying it, or a subtag, on the map", () => {
    const tag = luhmann.tags[0]
    expect(tag).toBeDefined()
    const places = vaultResolver("en-US").tagged(tag)
    expect(places).toContainEqual({ lat: 52.0302, lng: 8.5325, title: luhmann.title, url: luhmann.url, description: luhmann.description })
    // Notes without a location are left out.
    expect(places.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true)
    const parent = tag.includes("/") ? tag.split("/")[0] : undefined
    if (parent)
      expect(
        vaultResolver("en-US")
          .tagged(parent)
          .map((p) => p.url),
      ).toContain(luhmann.url)
    expect(vaultResolver("en-US").tagged("no-such-tag-anywhere")).toEqual([])
  })

  test("renders tagged places, and draws dark tiles when the site has them", () => {
    const before = site.map.darkTiles
    site.map.darkTiles = "https://dark.example/{z}/{x}/{y}.png"
    try {
      const html = renderLeafletBlock(`id: t\nmarkerTag: #${luhmann.tags[0]}`, "en-US")
      expect(html).toContain('data-tiles-dark="https://dark.example/{z}/{x}/{y}.png"')
      expect(html).toContain(`href="${luhmann.url}" class="internal"`)
      expect(html).not.toContain("data-zoom")
    } finally {
      site.map.darkTiles = before
    }
  })

  test("external places link out, and a map of only a view has no list", () => {
    const html = renderLeafletBlock("marker: default, 1, 2, https://example.com, Far away\nlat: 3\nlong: 4", "en-US")
    expect(html).toContain('<li><a href="https://example.com">Far away</a></li>')
    expect(html).toContain('data-center="3,4"')
    const bare = renderLeafletBlock("lat: 3\nlong: 4", "en-US")
    expect(bare).not.toContain("map-list")
    expect(renderLeafletBlock("id: empty", "en-US")).toContain("(leaflet: no place)")
  })

  test("a protected or unknown note is no place", () => {
    const r = vaultResolver("en-US")
    expect(r.note("Missing note that is not there")).toBeUndefined()
    const locked = getVault().notes["en-US"].find((n) => n.protected)
    if (locked) expect(r.note(locked.title)).toBeUndefined()
  })
})

describe("inlining assets", () => {
  const vault = path.join(tmp, "inline")
  fs.mkdirSync(path.join(vault, "folder.png"), { recursive: true })

  test("a URL that does not decode, or a file that cannot be read, is left alone", () => {
    const html = '<img src="/assets/%E0%A4%A.png"><img src="/assets/gone.png"><img src="/assets/folder.png">'
    expect(inlineAssets(html, vault, () => false)).toEqual({ html, inlined: [] })
  })

  test("unknown file types are sent as plain bytes", () => {
    expect(mediaType("a.xyz")).toBe("application/octet-stream")
    expect(mediaType("A.JPG")).toBe("image/jpeg")
  })
})
