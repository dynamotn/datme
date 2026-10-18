import { writeSync } from "node:fs"
import { createInterface } from "node:readline"

if (process.env.FAKE_TTS_NO_START === "1") process.exit(1)
// The helper enrols DATME_TTS_VOICE before it is ready: a sample it cannot use fails the start.
if (process.env.DATME_TTS_VOICE?.includes("unusable")) process.exit(1)

const noisy = process.env.FAKE_TTS_NOISE === "1"
if (noisy) console.log("Loading model... 50%\n42\nnull")
console.log(JSON.stringify({ ready: true }))

for await (const line of createInterface({ input: process.stdin })) {
  const { id, chunks } = JSON.parse(line) as { id: number; chunks: string[] }
  const has = (word: string) => chunks.some((c) => c.includes(word))
  if (has("CRASH") || process.env.FAKE_TTS_CRASH === "1") process.exit(0)
  const reply = has("FAIL")
    ? { id, error: "boom" }
    : has("BADID")
      ? { id: id + 1000, mp3: Buffer.from("stray").toString("base64") }
      : has("EMPTY")
        ? { id, mp3: "" }
        : has("NOMP3")
          ? { id }
          : { id, mp3: Buffer.from("MP3:" + chunks.join("|")).toString("base64") }
  if (noisy) console.log("{not json")
  if (has("LAST")) {
    writeSync(1, JSON.stringify(reply) + "\n")
    process.exit(0)
  }
  console.log(JSON.stringify(reply))
  // A second answer to the same request: one for nothing pending.
  if (has("TWICE")) console.log(JSON.stringify(reply))
}
