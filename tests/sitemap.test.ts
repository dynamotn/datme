import { afterAll, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { indexable } from "../src/lib/sitemap"

const out = fs.mkdtempSync(path.join(os.tmpdir(), "datme-sitemap-"))
const page = (rel: string, html: string) => {
  fs.mkdirSync(path.join(out, rel), { recursive: true })
  fs.writeFileSync(path.join(out, rel, "index.html"), html)
}
page("Kept", "<html><head><title>Kept</title></head></html>")
page("Thư mục/Hidden", '<html><head><meta name="robots" content="noindex"></head></html>')

afterAll(() => fs.rmSync(out, { recursive: true, force: true }))

describe("which pages the sitemap lists", () => {
  test("a built page, but not one kept out of search engines", () => {
    expect(indexable("https://x.dev/Kept/", out)).toBe(true)
    expect(indexable(`https://x.dev/${encodeURIComponent("Thư mục")}/Hidden/`, out)).toBe(false)
  })

  test("a page that cannot be read is left out, with a warning, rather than risk listing a noindex page", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(indexable("https://x.dev/Gone/", out)).toBe(false)
      expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(["[datme] https://x.dev/Gone/ is left out of the sitemap: its page cannot be read (ENOENT)"])
    } finally {
      warn.mockRestore()
    }
  })
})
