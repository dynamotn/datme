import { describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import { exportHtml } from "../src/lib/export"

describe("export to one page", () => {
  test("images of the vault are inlined as data URLs, so the page stands on its own", async () => {
    const html = await exportHtml(".", "en-US")
    const srcs = [...html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1])
    const inlined = srcs.filter((s) => s.startsWith("data:image/"))
    expect(inlined.length).toBeGreaterThan(0)
    for (const s of inlined) expect(s).toMatch(/^data:image\/(png|jpeg|gif|webp|svg\+xml|avif);base64,[A-Za-z0-9+/]+=*$/)
    // No image is left pointing at the copies of the published site's assets.
    expect(srcs.some((s) => s.startsWith("/assets/"))).toBe(false)
  })

  test("an image whose copy is not in the vault points at the published site", async () => {
    const exists = spyOn(fs, "existsSync").mockImplementation(
      ((p: fs.PathLike) =>
        !/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(String(p)) && fs.statSync(p, { throwIfNoEntry: false }) !== undefined) as typeof fs.existsSync,
    )
    try {
      const srcs = [...(await exportHtml(".", "en-US")).matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1])
      expect(srcs.length).toBeGreaterThan(0)
      expect(srcs.some((s) => s.startsWith("data:"))).toBe(false)
      expect(srcs.filter((s) => s.startsWith("https://notes.dynamotn.dev/"))).not.toHaveLength(0)
    } finally {
      exists.mockRestore()
    }
  })

  test("without the KaTeX stylesheet the page is still written", async () => {
    const original = fs.readFileSync
    const read = spyOn(fs, "readFileSync").mockImplementation(((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (String(p).endsWith("katex.min.css")) throw new Error("ENOENT")
      return (original as (...a: unknown[]) => unknown)(p, ...rest)
    }) as typeof fs.readFileSync)
    try {
      const html = await exportHtml(".", "en-US")
      expect(html).toContain("<style>")
      expect(html).not.toContain(".katex")
    } finally {
      read.mockRestore()
    }
  })
})
