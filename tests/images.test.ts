import { afterAll, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { site } from "../src/site.config"
import { imageSize, renderVariant } from "../src/lib/images"

const rel = "_assets/images/truncated-test.png"
const file = path.join(site.vault, rel)
afterAll(() => fs.rmSync(file, { force: true }))

describe("resized images", () => {
  test("a truncated image falls back to its original file with a warning", async () => {
    const whole = fs.readFileSync(path.join(site.vault, "_assets/images/wide.png"))
    const cut = whole.subarray(0, Math.floor(whole.length / 2))
    fs.writeFileSync(file, cut)
    expect((await imageSize(rel))?.width).toBe(1200)
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(Buffer.from(await renderVariant(rel, 480)).equals(cut)).toBe(true)
      expect(String(warn.mock.calls[0]?.[0])).toContain(rel)
    } finally {
      warn.mockRestore()
    }
  })
})
