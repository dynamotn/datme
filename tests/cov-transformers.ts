/**
 * transformers.js as the browser would load it from the CDN, replaced by a
 * model that knows two directions: food, and everything else. Shared by the
 * test files that search by meaning, since the module that loads it keeps the
 * first model it gets.
 */
import { mock } from "bun:test"

export const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.web.js"

export const model = {
  /** The next download of the model fails. */
  failNext: false,
  downloads: 0,
  /** The models asked for, by name. */
  asked: [] as string[],
}

/** A unit vector: [0, 1] for food, [1, 0] for anything else. */
export const embed = (text: string) => (/food|cook/i.test(text) ? [0, 1] : [1, 0])

mock.module(TRANSFORMERS, () => ({
  async pipeline(task: string, name: string, opts: { dtype: string }) {
    model.downloads++
    model.asked.push(`${task}:${name}:${opts.dtype}`)
    if (model.failNext) {
      model.failNext = false
      throw new Error("download failed")
    }
    return async (texts: string[], o: { pooling: string; normalize: boolean }) => ({
      tolist: () => texts.map((t) => (o.pooling === "mean" && o.normalize ? embed(t) : [])),
    })
  },
}))
