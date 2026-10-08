import { listed } from "./vault"
import { aboutText } from "./related"
import { embed } from "./embeddings"
import type { Lang } from "../site.config"

/** The note vectors a page loads for semantic search: one int8 vector per note, base64. */
export interface NoteVectors {
  model: string
  dims: number
  notes: { u: string; v: string }[]
}

/** A unit vector as int8 (×127), base64: 384 bytes for the default model instead of kilobytes of JSON. */
export function quantize(v: number[]): string {
  const bytes = new Int8Array(v.length)
  v.forEach((x, i) => (bytes[i] = Math.max(-127, Math.min(127, Math.round(x * 127)))))
  return Buffer.from(bytes.buffer).toString("base64")
}

/** Vectors of the listed notes of a language, from the embeddings related notes already compute; never protected ones. */
export async function noteVectors(lang: Lang, model: string): Promise<NoteVectors> {
  const notes = listed(lang).filter((n) => !n.protected)
  const vectors = await embed(notes.map((n) => ({ id: n.key, text: aboutText(n) })), model)
  const out = notes.flatMap((n) => {
    const v = vectors.get(n.key)
    return v ? [{ u: n.url, v: quantize(v) }] : []
  })
  return { model, dims: vectors.values().next().value?.length ?? 0, notes: out }
}
