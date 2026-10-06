import { describe, expect, test } from "bun:test"
import { renderOg, stripEmoji } from "../src/lib/og"

describe("social cards", () => {
  test("emoji are dropped, since the card has no emoji font", () => {
    expect(stripEmoji("🪴 Khu vườn ❤️ số")).toBe("Khu vườn số")
  })

  test("render Vietnamese titles to a 1200x630 PNG", async () => {
    const png = await renderOg({ title: "Đường đi của người Việt", kicker: "Khu vườn", meta: "Dự án", tags: ["blog"], logo: "đ" })
    expect(png.subarray(1, 4).toString()).toBe("PNG")
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
  })
})
