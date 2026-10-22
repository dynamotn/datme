import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { site } from "../src/site.config"
import { iconHtml, iconizeIcons, lucideSvg } from "../src/lib/icons"
import { assetPath, imageSize, placeholder, renderVariant, stamp, variantPath, variantWidths } from "../src/lib/images"

const tmpRoot = os.tmpdir()
fs.mkdirSync(tmpRoot, { recursive: true })
const tmp = fs.mkdtempSync(path.join(tmpRoot, "icons-images-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe("Iconize data", () => {
  const vault = path.join(tmp, "iconize")
  const data = path.join(vault, ".obsidian/plugins/obsidian-icon-folder/data.json")

  test("a vault without Iconize has no icons, and is not read again within a second", () => {
    fs.mkdirSync(vault, { recursive: true })
    const icons = iconizeIcons(vault)
    expect(icons.size).toBe(0)
    expect(iconizeIcons(vault)).toBe(icons)
  })

  test("after a second, an unchanged data.json keeps the same map", () => {
    fs.mkdirSync(path.dirname(data), { recursive: true })
    fs.writeFileSync(
      data,
      JSON.stringify({ settings: {}, Books: "📚", "Books/Dune.md": { iconName: "LiBook", iconColor: "red" }, Empty: "", Odd: { iconName: 3 } }),
    )
    const now = Date.now()
    const clock = spyOn(Date, "now")
    try {
      clock.mockImplementation(() => now + 5_000)
      const first = iconizeIcons(vault)
      expect([...first.entries()]).toEqual([
        ["Books", { name: "📚" }],
        ["Books/Dune.md", { name: "LiBook", color: "red" }],
      ])
      clock.mockImplementation(() => now + 10_000)
      expect(iconizeIcons(vault)).toBe(first)
    } finally {
      clock.mockRestore()
    }
  })

  test("a broken data.json gives no icons", () => {
    const broken = path.join(tmp, "broken")
    fs.mkdirSync(path.join(broken, ".obsidian/plugins/obsidian-icon-folder"), { recursive: true })
    fs.writeFileSync(path.join(broken, ".obsidian/plugins/obsidian-icon-folder/data.json"), "{not json")
    expect(iconizeIcons(broken).size).toBe(0)
  })
})

describe("icon packs", () => {
  const vault = path.join(tmp, "packs")

  beforeAll(() => {
    fs.mkdirSync(path.join(vault, ".obsidian/icons/aaa-empty"), { recursive: true })
    fs.mkdirSync(path.join(vault, ".obsidian/icons/bbb-pack"), { recursive: true })
    fs.writeFileSync(path.join(vault, ".obsidian/icons/bbb-pack/Star.svg"), '<svg width="24" class="x"><!-- MIT --><path d="b"/></svg>')
  })

  test("the pack holding the icon gives it, sized to the text", () => {
    expect(iconHtml("BxStar", undefined, vault)).toBe(
      '<span class="iconize"><svg width="1em" height="1em" aria-hidden="true" focusable="false"><path d="b"/></svg></span>',
    )
    // Asked again, it comes from memory.
    fs.rmSync(path.join(vault, ".obsidian/icons/bbb-pack/Star.svg"))
    expect(iconHtml("BxStar", undefined, vault)).toContain('d="b"')
  })

  test("an icon in no pack, or a vault without packs, shows nothing", () => {
    expect(iconHtml("BxMissing", undefined, vault)).toBeUndefined()
    expect(iconHtml("BxStar", undefined, path.join(tmp, "no-packs"))).toBeUndefined()
    expect(iconHtml("LiNoSuchIconAtAll", undefined, vault)).toBeUndefined()
  })
})

describe("Lucide icons by name", () => {
  test("by its own name or Obsidian's, sized; unknown or odd names give nothing", () => {
    const pin = lucideSvg("map-pin")!
    expect(pin).toStartWith('<svg width="1em" height="1em" aria-hidden="true" focusable="false"')
    expect(lucideSvg(" Lucide-Map-Pin ")).toBe(pin)
    expect(lucideSvg("no-such-icon-here")).toBeUndefined()
    expect(lucideSvg("../etc/passwd")).toBeUndefined()
    expect(lucideSvg("")).toBeUndefined()
  })
})

describe("images", () => {
  const vault = path.join(tmp, "images")
  const saved = { vault: site.vault, images: { ...site.images } }
  let noise: Buffer

  beforeAll(async () => {
    fs.mkdirSync(vault, { recursive: true })
    const raw = Buffer.alloc(200 * 100 * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251
    noise = await sharp(raw, { raw: { width: 200, height: 100, channels: 3 } })
      .png()
      .toBuffer()
    fs.writeFileSync(path.join(vault, "opaque.png"), noise)
    fs.writeFileSync(path.join(vault, "cut.png"), noise.subarray(0, Math.floor(noise.length / 2)))
    await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } })
      .png()
      .toFile(path.join(vault, "clear.png"))
    await sharp({ create: { width: 40, height: 20, channels: 3, background: "#808080" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(path.join(vault, "turned.jpg"))
    site.vault = vault
  })
  afterAll(() => {
    site.vault = saved.vault
    Object.assign(site.images, saved.images)
  })

  test("a missing file has no stamp and no size; other formats have no size", async () => {
    expect(stamp("nope-cov.png")).toBe("missing")
    expect(stamp("opaque.png")).toMatch(/^\d+:\d+$/)
    expect(await imageSize("nope-cov.png")).toBeUndefined()
    expect(await imageSize("drawing.svg")).toBeUndefined()
  })

  test("a quarter-turned photo swaps its sides; transparency is noticed", async () => {
    expect(await imageSize("turned.jpg")).toEqual({ width: 20, height: 40, alpha: false })
    expect(await imageSize("clear.png")).toEqual({ width: 40, height: 20, alpha: true })
  })

  test("a resized copy is a WebP of the asked width", async () => {
    const out = await renderVariant("opaque.png", 64)
    const meta = await sharp(out).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 64, 32])
  })

  test("a blurred placeholder only for opaque images that decode, and only when wanted", async () => {
    expect(await placeholder("opaque.png")).toMatch(/^data:image\/webp;base64,/)
    expect(await placeholder("clear.png")).toBeUndefined()
    expect(await placeholder("cut.png")).toBeUndefined()
    expect(await placeholder("nope-cov.png")).toBeUndefined()
    site.images.placeholders = false
    expect(await placeholder("opaque.png")).toBeUndefined()
  })

  test("widths and paths of the resized copies", () => {
    site.images.optimize = true
    site.images.widths = [480, 960, 1600]
    expect(variantWidths(1000)).toEqual([480, 960])
    site.images.optimize = false
    expect(variantWidths(1000)).toEqual([])
    expect(assetPath("Photos/a b#.png")).toBe("/assets/Photos/a%20b%23.png")
    expect(variantPath("a b.png", 480)).toBe("/assets/a%20b.png.w480.webp")
  })
})
