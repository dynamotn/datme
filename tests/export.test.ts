import { describe, expect, test } from "bun:test"
import { inflateRawSync } from "node:zlib"
import { fromHtml } from "hast-util-from-html"
import { getVault } from "../src/lib/vault"
import { bookNotes, exportEpub, exportHtml } from "../src/lib/export"
import { toXhtml } from "../src/lib/xhtml"
import { crc32, zip } from "../src/lib/zip"

/** Files of a ZIP archive, read back from its central directory. */
function unzip(data: Uint8Array): Map<string, string> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const end = data.length - 22
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 20, true)
    const nameLen = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(data.subarray(at + 46, at + 46 + nameLen))
    const start = local + 30 + view.getUint16(local + 26, true)
    const body = data.subarray(start, start + size)
    files.set(name, new TextDecoder().decode(method === 8 ? inflateRawSync(body) : body))
    at += 46 + nameLen
  }
  return files
}

describe("zip", () => {
  test("files come back as they went in, the stored ones uncompressed", () => {
    const archive = zip([
      { name: "mimetype", data: "application/epub+zip", store: true },
      { name: "a/b.txt", data: "hello ".repeat(100) },
    ])
    expect(new TextDecoder().decode(archive.subarray(30, 38))).toBe("mimetype")
    expect(new TextDecoder().decode(archive.subarray(38, 58))).toBe("application/epub+zip")
    expect(unzip(archive).get("a/b.txt")).toBe("hello ".repeat(100))
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926)
  })
})

describe("xhtml", () => {
  test("void elements close, booleans are spelled out, SVG gets its namespace", () => {
    const tree = fromHtml('<p>a<br>b <input type="checkbox" checked disabled> <img src="x.png" alt="&lt;x&gt;"></p><svg viewBox="0 0 1 1"></svg>', { fragment: true })
    expect(toXhtml(tree)).toBe(
      '<p>a<br/>b <input type="checkbox" checked="checked" disabled="disabled"/> <img src="x.png" alt="&lt;x&gt;"/></p><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
    )
  })
})

describe("export", () => {
  test("a folder reads in tree order: its introduction, its notes, its subfolders; protected notes are left out", () => {
    const root = getVault().folders["vi-VN"].get("")!
    const keys = bookNotes(root).map((n) => n.key)
    expect(keys).toEqual([
      "01_Fleeting/01_Fleeting",
      "03_Atomic/Code",
      "03_Atomic/Queries",
      "03_Atomic/Zettelkasten",
      "06_Reference/Niklas Luhmann",
      "07_Project/Blog post",
      "07_Project/Poem",
    ])
  })

  test("EPUB: mimetype first, a chapter per note, links between chapters, images inside", async () => {
    const files = unzip(await exportEpub(".", "en-US"))
    expect([...files.keys()][0]).toBe("mimetype")
    expect(files.get("OEBPS/content.opf")).toContain('<itemref idref="c6"/>')
    expect(files.get("OEBPS/nav.xhtml")).toContain('<a href="chapter-5.xhtml">Niklas Luhmann (sociologist)</a>')
    const zettel = files.get("OEBPS/chapter-4.xhtml")!
    expect(zettel).toContain('<a href="chapter-5.xhtml" class="internal" data-key="06_Reference/Niklas Luhmann">')
    expect(zettel).toMatch(/<img src="images\/\d\.png"/)
    expect(zettel).not.toContain("srcset")
    expect([...files.keys()].some((f) => f.startsWith("OEBPS/images/"))).toBe(true)
    expect([...files.values()].join("")).not.toContain("Protected content")
  })

  test("HTML: one page, chapters linked by anchor, images inlined", async () => {
    const html = await exportHtml("06_Reference", "vi-VN")
    expect(html).toContain('<section class="chapter" id="chapter-1"><h1 class="chapter-title">Niklas Luhmann</h1>')
    // A link leaving the book points at the published site.
    expect(html).toContain('href="https://notes.dynamotn.dev/03_Atomic/Zettelkasten"')
    expect(html).not.toContain("Protected content")
  })

  test("an unknown folder is explained", async () => {
    await expect(exportEpub("Nowhere")).rejects.toThrow('no published folder "Nowhere"')
  })
})
