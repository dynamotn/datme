/**
 * Search by meaning, from the note vectors the build computes with
 * related.semantic: "notes like this one" needs nothing more, and with
 * search.meaning a reader can also embed the query itself, in the browser,
 * with the same model. Nothing a reader types leaves the page.
 */
export interface Vectors {
  model: string
  dims: number
  notes: { u: string; v: string }[]
}

/** An int8 vector written as base64 by the build. */
export function decode(b64: string): Int8Array {
  const bin = atob(b64)
  const out = new Int8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24
  return out
}

/** Cosine similarity of an int8 note vector (×127) and a unit vector, or two int8 ones. */
export function similarity(a: ArrayLike<number>, b: ArrayLike<number>, scale = 127 * 127): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s / scale
}

export interface Near {
  url: string
  sim: number
}

/** Notes closest to a vector, best first, above a threshold and without `skip`. */
export function nearest(target: ArrayLike<number>, notes: { url: string; v: Int8Array }[], k: number, threshold: number, skip?: (url: string) => boolean, scale = 127 * 127): Near[] {
  return notes
    .filter((n) => !skip?.(n.url))
    .map((n) => ({ url: n.url, sim: similarity(n.v, target, scale) }))
    .filter((n) => n.sim >= threshold)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k)
}

/**
 * Words and meaning together: word matches scaled to their best score, plus
 * closeness in meaning from the threshold up, so a note found by meaning alone
 * still ranks below one that also has the words.
 */
export function blend(words: { url: string; score: number }[], meaning: Near[], threshold: number): string[] {
  const best = Math.max(0, ...words.map((w) => w.score)) || 1
  const score = new Map<string, number>()
  for (const w of words) score.set(w.url, 0.6 * (w.score / best))
  for (const m of meaning) {
    const closeness = Math.max(0, (m.sim - threshold) / (1 - threshold || 1))
    score.set(m.url, (score.get(m.url) ?? 0) + 0.4 * closeness)
  }
  return [...score].sort((a, b) => b[1] - a[1]).map(([url]) => url)
}

const loaded = new Map<string, Promise<{ url: string; v: Int8Array }[] | undefined>>()

/** The note vectors of a language, or undefined when the site has none. */
export function loadVectors(lang: string): Promise<{ url: string; v: Int8Array }[] | undefined> {
  let hit = loaded.get(lang)
  if (!hit) {
    hit = fetch(`/static/vectors.${lang}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Vectors>) : undefined))
      .then((data) => data?.notes.map((n) => ({ url: n.u, v: decode(n.v) })))
      .catch(() => undefined)
    loaded.set(lang, hit)
  }
  return hit
}

/** transformers.js in the browser, from the CDN; only loaded when a reader asks to search by meaning. */
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.web.js"

type Extract = (texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>
let extractor: Promise<Extract> | undefined

/** Embed a query with the model the build used; the first call downloads it. */
export async function embedQuery(model: string, text: string): Promise<number[]> {
  extractor ??= (import(/* @vite-ignore */ TRANSFORMERS) as Promise<{ pipeline(task: string, model: string, o: { dtype: string }): Promise<Extract> }>).then((tf) =>
    tf.pipeline("feature-extraction", model, { dtype: "q8" }),
  )
  // A failed download can be tried again.
  extractor.catch(() => (extractor = undefined))
  const out = await (await extractor)([text], { pooling: "mean", normalize: true })
  return out.tolist()[0]
}
