import { afterEach, describe, expect, test } from "bun:test"
import { site } from "../src/site.config"
import { setEmbedder } from "../src/lib/embeddings"
import { getVault } from "../src/lib/vault"
import { relatedNotes, unlinkedMentions } from "../src/lib/related"
import { topicOf, topics } from "../src/lib/topics"

const g = globalThis as { __vaultVersion?: number }
const versionBefore = g.__vaultVersion
const semanticBefore = site.related.semantic
const topicsBefore = site.topics

afterEach(() => {
  site.related.semantic = semanticBefore
  site.topics = topicsBefore
  setEmbedder(undefined)
  if (versionBefore === undefined) delete g.__vaultVersion
  else g.__vaultVersion = versionBefore
})

/** An embedder that fails like a missing model, counting its calls. */
function failingModel() {
  const calls = { n: 0 }
  setEmbedder(async () => {
    calls.n++
    throw new Error("no model")
  })
  site.related.semantic = { model: "missing", threshold: 0.5 }
  return calls
}

describe("without the embedding model", () => {
  test("related notes fail for this build and are tried again on the next call", async () => {
    // A vault version of its own, so no related notes computed by another test are reused.
    g.__vaultVersion = 7_000_001
    const calls = failingModel()
    const note = getVault().notes["en-US"].find((n) => !n.isHome && !n.unlisted && !n.protected)!
    await expect(relatedNotes(note)).rejects.toThrow("no model")
    // Mentions share the same computation, which failed and was forgotten: it runs again.
    await expect(unlinkedMentions(note)).rejects.toThrow("no model")
    expect(calls.n).toBe(2)
  })

  test("topics are none for this build, and are tried again on the next call", async () => {
    g.__vaultVersion = 7_000_002
    const calls = failingModel()
    expect(await topics("en-US")).toEqual([])
    expect(await topicOf("en-US")).toEqual(new Map())
    expect(calls.n).toBe(2)
  })

  test("related notes and mentions can be turned off without computing anything", async () => {
    g.__vaultVersion = 7_000_003
    const calls = failingModel()
    const count = site.related.count
    const mentions = site.related.mentions
    site.related.count = 0
    site.related.mentions = false
    try {
      const note = getVault().notes["en-US"][0]
      expect(await relatedNotes(note)).toEqual([])
      expect(await unlinkedMentions(note)).toEqual([])
      site.topics = false
      expect(await topics("en-US")).toEqual([])
      expect(calls.n).toBe(0)
    } finally {
      site.related.count = count
      site.related.mentions = mentions
    }
  })
})
