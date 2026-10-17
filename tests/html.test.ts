import { describe, expect, test } from "bun:test"
import { escapeAttr, escapeAttrKeepGt, escapeAttrMinimal, escapeHtml, escapeText, escapeXml } from "../src/lib/html"

const ALL = `a & b < c > d " e ' f`

describe("html escaping", () => {
  test("each variant replaces exactly its own characters", () => {
    expect(escapeText(ALL)).toBe(`a &amp; b &lt; c &gt; d " e ' f`)
    expect(escapeAttr(ALL)).toBe(`a &amp; b &lt; c &gt; d &quot; e ' f`)
    expect(escapeAttrKeepGt(ALL)).toBe(`a &amp; b &lt; c > d &quot; e ' f`)
    expect(escapeXml(ALL)).toBe(`a &amp; b &lt; c > d " e ' f`)
    expect(escapeHtml(ALL)).toBe(`a &amp; b &lt; c &gt; d &quot; e &#39; f`)
    expect(escapeAttrMinimal(ALL)).toBe(`a &amp; b < c > d &quot; e ' f`)
  })

  test("an entity already in the text is escaped once more, not kept", () => {
    expect(escapeAttr("&amp; &quot;")).toBe("&amp;amp; &amp;quot;")
  })

  test("text without special characters comes back unchanged", () => {
    expect(escapeHtml("Ghi chú 2026")).toBe("Ghi chú 2026")
  })
})
