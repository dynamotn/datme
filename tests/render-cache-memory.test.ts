import { expect, test } from "bun:test"
import { probeVault } from "./vault-probe"

test("datme dev keeps only the notes rendered for the current version of the vault", () => {
  const { result } = probeVault(
    {
      "A.md": "---\npublish: true\n---\nSee [[B]].\n",
      "B.md": "---\npublish: true\n---\nBack to [[A]].\n",
    },
    `import { getVault } from "$src/lib/vault"
import { renderNote, renderedNotes } from "$src/lib/markdown"
const g = globalThis
const renderAll = async () => {
  const v = getVault()
  for (const n of Object.values(v.notes).flat()) await renderNote(n)
}
await renderAll()
const first = renderedNotes()
for (let i = 1; i <= 5; i++) {
  g.__vaultVersion = i
  await renderAll()
}
console.log(JSON.stringify({ first, last: renderedNotes() }))`,
  )
  expect(result.first).toBeGreaterThan(0)
  // Five edits later, the same notes, not six copies of them.
  expect(result.last).toBe(result.first)
}, 60_000)
