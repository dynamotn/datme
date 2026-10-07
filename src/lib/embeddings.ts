/**
 * Sentence embeddings of notes, for suggesting notes similar in meaning. They
 * are computed on this machine with transformers.js and a small multilingual
 * model; nothing is sent anywhere. Each note's vector is cached by its text,
 * so a build only embeds the notes that changed.
 */
import crypto from "node:crypto"
import { readCache, writeCache } from "./render-cache"

/** Turns texts into unit-length vectors, one per text. */
export type Embedder = (texts: string[]) => Promise<number[][]>

let override: Embedder | undefined
/** Replace the model, e.g. in tests; undefined restores it. */
export function setEmbedder(e: Embedder | undefined): void {
  override = e
}

export class EmbeddingsUnavailable extends Error {}

const pipelines = new Map<string, Promise<Embedder>>()

/** The part of transformers.js used here; the package itself is optional, so it is not a type dependency. */
interface Transformers {
  pipeline(
    task: "feature-extraction",
    model: string,
    options: { dtype: string },
  ): Promise<(texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): unknown }>>
}

/** transformers.js, loaded only when semantic suggestions are on: it is an optional dependency. */
function modelEmbedder(model: string): Promise<Embedder> {
  let p = pipelines.get(model)
  if (!p) {
    p = (async () => {
      let tf: Transformers
      try {
        // A variable keeps bundlers from resolving the optional package at build time.
        const name = "@huggingface/transformers"
        tf = (await import(name)) as Transformers
      } catch {
        throw new EmbeddingsUnavailable(
          "related.semantic needs @huggingface/transformers: install it next to datme (bun add @huggingface/transformers), or turn semantic off",
        )
      }
      const extract = await tf.pipeline("feature-extraction", model, { dtype: "q8" })
      return async (texts: string[]) => {
        const out = await extract(texts, { pooling: "mean", normalize: true })
        return out.tolist() as number[][]
      }
    })()
    pipelines.set(model, p)
  }
  return p
}

const BATCH = 16

/** The vectors of some texts by id; cached ones are read, the others computed in batches. */
export async function embed(items: { id: string; text: string }[], model: string): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>()
  const todo: { id: string; text: string; key: string[] }[] = []
  for (const it of items) {
    const key = [model, crypto.createHash("sha256").update(it.text).digest("hex")]
    const hit = override ? undefined : readCache("embeddings", import.meta.url, key)
    if (hit) out.set(it.id, JSON.parse(hit.toString("utf8")))
    else todo.push({ ...it, key })
  }
  if (!todo.length) return out
  const embedder = override ?? (await modelEmbedder(model))
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const vectors = await embedder(batch.map((b) => b.text))
    batch.forEach((b, j) => {
      // Rounded: the cache stays small, and similarities do not need more.
      const v = vectors[j].map((x) => Math.round(x * 1e5) / 1e5)
      out.set(b.id, v)
      if (!override) writeCache("embeddings", import.meta.url, b.key, JSON.stringify(v))
    })
  }
  return out
}

/** Cosine similarity of two unit vectors. */
export function cosine(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
