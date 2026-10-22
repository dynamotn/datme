import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { site } from "../src/site.config"
import { publicOriginal } from "../src/lib/images"

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "image-metadata-"))
const saved = { vault: site.vault, keepMetadata: site.images.keepMetadata }
const read = (rel: string) => fs.readFileSync(path.join(vault, rel))
const picture = (format: "jpeg" | "png" | "webp") => sharp({ create: { width: 40, height: 20, channels: 3, background: "#808080" } })[format]()

beforeAll(async () => {
  const exif = { IFD0: { Make: "SecretPhone", Model: "Pocket 9" }, IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "E" } }
  await picture("jpeg").withExif(exif).withMetadata({ orientation: 6 }).toFile(path.join(vault, "phone.jpg"))
  await picture("webp").withExif(exif).toFile(path.join(vault, "phone.webp"))
  await picture("png")
    .withXmp(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Secret Author</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>',
    )
    .toFile(path.join(vault, "tagged.png"))
  await picture("png").toFile(path.join(vault, "plain.png"))
  fs.writeFileSync(path.join(vault, "broken.jpg"), "not a picture")
  // The same photo under a name that says otherwise, or in a format sharp cannot read.
  fs.copyFileSync(path.join(vault, "phone.jpg"), path.join(vault, "phone.gif"))
  fs.copyFileSync(path.join(vault, "phone.jpg"), path.join(vault, "stuck.jpg"))
  fs.writeFileSync(path.join(vault, "phone.heic"), Buffer.concat([Buffer.from("ftypheic"), Buffer.from("Exif\0\0SecretPhone")]))
  fs.writeFileSync(path.join(vault, "paper.pdf"), "%PDF-1.4")
  site.vault = vault
})
afterAll(() => {
  site.vault = saved.vault
  site.images.keepMetadata = saved.keepMetadata
  fs.rmSync(vault, { recursive: true, force: true })
})

describe("published originals", () => {
  test("a photo loses its EXIF, GPS included, and is turned upright", async () => {
    expect((await sharp(read("phone.jpg")).metadata()).exif).toBeDefined()
    const out = await publicOriginal("phone.jpg")
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe("jpeg")
    expect(meta.exif).toBeUndefined()
    expect(out.includes("SecretPhone")).toBe(false)
    // Orientation 6 was a quarter turn: applied, the sides swap.
    expect([meta.width, meta.height]).toEqual([20, 40])
  })

  test("WebP keeps its format, and XMP goes like EXIF", async () => {
    const webp = await sharp(await publicOriginal("phone.webp")).metadata()
    expect([webp.format, webp.exif]).toEqual(["webp", undefined])
    const png = await publicOriginal("tagged.png")
    expect((await sharp(png).metadata()).xmp).toBeUndefined()
    expect(png.includes("Secret Author")).toBe(false)
  })

  test("a file with nothing to strip, or that is no picture, goes out as it is", async () => {
    expect((await publicOriginal("plain.png")).equals(read("plain.png"))).toBe(true)
    expect((await publicOriginal("paper.pdf")).equals(read("paper.pdf"))).toBe(true)
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect((await publicOriginal("broken.jpg")).equals(read("broken.jpg"))).toBe(true)
      expect(String(warn.mock.calls[0]?.[0])).toContain("broken.jpg")
    } finally {
      warn.mockRestore()
    }
  })

  test("what the file holds counts, not its name", async () => {
    const out = await publicOriginal("phone.gif")
    expect((await sharp(out).metadata()).exif).toBeUndefined()
    expect(out.includes("SecretPhone")).toBe(false)
  })

  test("metadata that cannot be removed stops the build rather than going out", async () => {
    const encode = spyOn(sharp.prototype, "toBuffer").mockImplementation(() => Promise.reject(new Error("no encoder")))
    try {
      await expect(publicOriginal("stuck.jpg")).rejects.toThrow("stuck.jpg holds metadata")
    } finally {
      encode.mockRestore()
    }
    await expect(publicOriginal("phone.heic")).rejects.toThrow("images.keepMetadata")
  })

  test("images.keepMetadata publishes originals unchanged", async () => {
    site.images.keepMetadata = true
    expect((await publicOriginal("phone.jpg")).equals(read("phone.jpg"))).toBe(true)
  })
})
