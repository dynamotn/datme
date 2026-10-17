import { describe, expect, test } from "bun:test"
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
})
