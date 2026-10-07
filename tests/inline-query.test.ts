import { expect, test } from "bun:test"
import { getVault } from "../src/lib/vault"
import { renderNote } from "../src/lib/markdown"

test("inline queries render their value in place; DataviewJS ones stay code", async () => {
  const note = getVault().byKey["en-US"].get("03_Atomic/Queries")!
  const { html } = await renderNote(note)
  expect(html).toContain('Score: <span class="dataview dv-inline">8</span>')
  expect(html).toMatch(/by <span class="dataview dv-inline"><a [^>]*>Niklas Luhmann<\/a>|by <span class="dataview dv-inline">Niklas Luhmann<\/span>/)
  expect(html).toContain("<code>$= dv.current()</code>")
})
