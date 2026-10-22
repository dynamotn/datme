import { describe, expect, test } from "bun:test"
import { cardSpec, renderOg, stripEmoji, type CardDesign } from "../src/lib/og"
import { STYLES } from "../src/site.config"

const card = { title: "Đường đi của người Việt", kicker: "Khu vườn", meta: "Dự án", tags: ["blog"], logo: "đ" }
const size = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)]

describe("social cards", () => {
  test("emoji are dropped, since the card has no emoji font", () => {
    expect(stripEmoji("🪴 Khu vườn ❤️ số")).toBe("Khu vườn số")
  })

  test("render Vietnamese titles to a 1200x630 PNG", async () => {
    const png = await renderOg(card)
    expect(png.subarray(1, 4).toString()).toBe("PNG")
    expect(size(png)).toEqual([1200, 630])
  })
})

describe("a card in the page's style", () => {
  test("each style with a look of its own has its own design, the rest a plain card", () => {
    const designs = Object.fromEntries(STYLES.map((s) => [s, cardSpec(s).design]))
    expect(designs).toEqual({
      notebook: "notebook",
      classic: "classic",
      garden: "garden",
      resume: "plain",
      darkroom: "darkroom",
      terminal: "terminal",
      blueprint: "blueprint",
      wiki: "plain",
      broadsheet: "broadsheet",
      herbarium: "herbarium",
      manuscript: "manuscript",
      lacquer: "lacquer",
      eink: "eink",
      paddy: "paddy",
    })
  })

  test("a plain card takes theme.accent, else its style's own, with text that reads on it", () => {
    expect(cardSpec("wiki")).toEqual({ design: "plain", accent: "#0645ad", onAccent: "#fff" })
    expect(cardSpec("resume").accent).toBe("#1f5f8b")
    expect(cardSpec("wiki", "#ffe800")).toEqual({ design: "plain", accent: "#ffe800", onAccent: "#0b0b0a" })
    expect(cardSpec("wiki", "rgb(124 58 237)").accent).toBe("#7c3aed")
    // A colour Satori could not draw keeps the style's own.
    expect(cardSpec("wiki", "rebeccapurple").accent).toBe("#0645ad")
    // The other designs keep their own colours whatever the accent.
    expect(cardSpec("garden", "#ffe800").accent).toBe("#2d6a4f")
  })

  test("the terminal glows in the accent only when it reads on its black screen", () => {
    expect(cardSpec("terminal").accent).toBe("#33ff66")
    expect(cardSpec("terminal", "#ffb000").accent).toBe("#ffb000")
    expect(cardSpec("terminal", "#0047ff").accent).toBe("#33ff66")
  })

  const DESIGNS: CardDesign[] = ["notebook", "classic", "garden", "herbarium", "paddy", "terminal", "blueprint", "lacquer", "broadsheet", "manuscript", "darkroom", "eink", "plain"]
  for (const design of DESIGNS) {
    test(`the ${design} card renders, with every part and with none`, async () => {
      const spec = { ...cardSpec("notebook"), design }
      expect(size(await renderOg({ ...card, title: "A title long enough to need a second line of the card, and a third", tags: ["a", "b", "c", "d", "e"] }, spec))).toEqual([1200, 630])
      expect(size(await renderOg({ title: "Short", kicker: "Site", logo: "🌱" }, spec))).toEqual([1200, 630])
    })
  }
})
