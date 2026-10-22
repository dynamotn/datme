import { afterAll, describe, expect, mock, test } from "bun:test"
import { cosine, embed, EmbeddingsUnavailable, setEmbedder } from "../src/lib/embeddings"

// transformers.js is an optional peer dependency, and the real one would download a model:
// it is faked here, in a file of its own, since a module mock holds for the whole test process.
const calls: { task: string; model: string; options: unknown; batches: string[][] }[] = []

afterAll(() => setEmbedder(undefined))

describe("embeddings with the model", () => {
  test("without transformers.js installed, semantic suggestions explain what to install", async () => {
    mock.module("@huggingface/transformers", async () => {
      throw new Error("Cannot find package '@huggingface/transformers'")
    })
    setEmbedder(undefined)
    const err = await embed([{ id: "a", text: "hello" }], "cov/missing-model").catch((e) => e)
    expect(err).toBeInstanceOf(EmbeddingsUnavailable)
    expect((err as Error).message).toContain("bun add @huggingface/transformers")
    // The failure is remembered per model: asking again gives the same answer without retrying.
    await expect(embed([{ id: "b", text: "again" }], "cov/missing-model")).rejects.toBeInstanceOf(EmbeddingsUnavailable)
  })

  test("with transformers.js, texts are embedded in batches of 16, rounded, through one pipeline per model", async () => {
    mock.module("@huggingface/transformers", () => ({
      pipeline: async (task: string, model: string, options: unknown) => {
        const call = { task, model, options, batches: [] as string[][] }
        calls.push(call)
        return async (texts: string[], opts: { pooling: string; normalize: boolean }) => {
          expect(opts).toEqual({ pooling: "mean", normalize: true })
          call.batches.push(texts)
          return { tolist: () => texts.map((t) => [t.length / 3, 1 / 7]) }
        }
      },
    }))
    setEmbedder(undefined)
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, text: "x".repeat(i + 1) }))
    const out = await embed(items, "cov/fake-model")
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ task: "feature-extraction", model: "cov/fake-model", options: { dtype: "q8" } })
    expect(calls[0].batches.map((b) => b.length)).toEqual([16, 4])
    expect(out.size).toBe(20)
    expect(out.get("n0")).toEqual([0.33333, 0.14286])
    expect(out.get("n19")).toEqual([6.66667, 0.14286])
    // The same model reuses its pipeline.
    await embed([{ id: "z", text: "zz" }], "cov/fake-model")
    expect(calls).toHaveLength(1)
  })

  test("nothing to embed asks nothing of the model", async () => {
    setEmbedder(async () => {
      throw new Error("not called")
    })
    expect((await embed([], "any")).size).toBe(0)
  })
})

describe("cosine", () => {
  test("of unit vectors is their dot product", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0)
    expect(cosine([0.6, 0.8], [0.6, 0.8])).toBeCloseTo(1)
    expect(cosine([], [])).toBe(0)
  })
})
