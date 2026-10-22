import { afterEach, expect, test } from "bun:test"
import { getVault, vaultMemo } from "../src/lib/vault"
import { renderNote, renderedNotes } from "../src/lib/markdown"

const g = globalThis as { __vaultVersion?: number }
const versionBefore = g.__vaultVersion
afterEach(() => {
  if (versionBefore === undefined) delete g.__vaultVersion
  else g.__vaultVersion = versionBefore
})

test("a vault memo keeps the values of the current version only", () => {
  const memo = vaultMemo<number>()
  let made = 0
  const make = () => ++made
  g.__vaultVersion = 9_000_001
  expect([memo.get("x", make), memo.get("x", make), memo.get("y", make)]).toEqual([1, 1, 2])
  expect(memo.size).toBe(2)
  // A new version starts over: built again, the old values gone.
  g.__vaultVersion = 9_000_002
  expect(memo.get("x", make)).toBe(3)
  expect(memo.size).toBe(1)
})

test("datme dev keeps only the notes rendered for the current version of the vault", async () => {
  const notes = (version: number) => {
    g.__vaultVersion = version
    return getVault()
      .notes["en-US"].filter((n) => !n.protected)
      .slice(0, 3)
  }
  for (const n of notes(9_000_011)) await renderNote(n)
  const first = renderedNotes()
  expect(first).toBeGreaterThan(0)
  for (let v = 9_000_012; v <= 9_000_015; v++) for (const n of notes(v)) await renderNote(n)
  // Four edits later, the same notes, not five copies of them.
  expect(renderedNotes()).toBe(first)
}, 60_000)
