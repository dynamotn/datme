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

test("a vault memo keeps the values of the current version only", () => {
  const { result } = probeVault(
    { "A.md": "---\npublish: true\n---\nA.\n" },
    `import { vaultMemo } from "$src/lib/vault"
const memo = vaultMemo()
let made = 0
const make = () => ++made
const a = [memo.get("x", make), memo.get("x", make), memo.get("y", make)]
globalThis.__vaultVersion = 1
const b = [memo.get("x", make)]
console.log(JSON.stringify({ a, b, size: memo.size }))`,
  )
  // Built once per key and version; a new version starts over.
  expect(result).toEqual({ a: [1, 1, 2], b: [3], size: 1 })
}, 60_000)
