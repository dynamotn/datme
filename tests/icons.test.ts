import { describe, expect, test } from "bun:test"
import { folderIcon, iconHtml, iconizeIcons, noteIcon } from "../src/lib/icons"

describe("Iconize icons", () => {
  test("its data.json is read by path, skipping its settings", () => {
    const icons = iconizeIcons()
    expect(icons.get("03_Atomic")).toEqual({ name: "LiBookOpen" })
    expect(icons.get("06_Reference")).toEqual({ name: "📚", color: "#b5532c" })
    expect(icons.has("settings")).toBe(false)
  })

  test("Lucide names become inline SVGs sized to the text", () => {
    const html = folderIcon("03_Atomic")!
    expect(html).toStartWith('<span class="iconize"><svg width="1em" height="1em" aria-hidden="true" focusable="false"')
    expect(html).not.toContain("@license")
    expect(html).not.toContain('width="24"')
  })

  test("emoji stay text, with their colour", () => {
    expect(folderIcon("06_Reference")).toBe('<span class="iconize" aria-hidden="true" style="color:#b5532c">📚</span>')
  })

  test("other packs come from the icons Iconize downloaded into the vault", () => {
    expect(noteIcon("07_Project/Poem", {})).toContain('<path d="M2 22 22 2"/>')
  })

  test("a note's icon frontmatter wins; unknown icons show nothing", () => {
    expect(noteIcon("06_Reference/Niklas Luhmann", { icon: "🧑‍🔬" })).toBe('<span class="iconize" aria-hidden="true">🧑‍🔬</span>')
    expect(noteIcon("07_Project/Talk", {})).toBeUndefined()
    expect(iconHtml(undefined)).toBeUndefined()
    expect(folderIcon("01_Fleeting")).toBeUndefined()
  })

  test("colours are only taken when they look like colours", () => {
    expect(iconHtml("⭐", 'red" onload="x')).toBe('<span class="iconize" aria-hidden="true">⭐</span>')
  })
})
