import { writeSync } from "node:fs"
import { createInterface } from "node:readline"

if (process.env.FAKE_TTS_NO_START === "1") process.exit(1)

const noisy = process.env.FAKE_TTS_NOISE === "1"
if (noisy) console.log("Loading model... 50%")
console.log(JSON.stringify({ ready: true }))

for await (const line of createInterface({ input: process.stdin })) {
  const { id, chunks } = JSON.parse(line) as { id: number; chunks: string[] }
  if (chunks.some((c) => c.includes("CRASH"))) process.exit(0)
  const reply = chunks.some((c) => c.includes("FAIL"))
    ? { id, error: "boom" }
    : { id, mp3: Buffer.from("MP3:" + chunks.join("|")).toString("base64") }
  if (noisy) console.log("{not json")
  if (chunks.some((c) => c.includes("LAST"))) {
    writeSync(1, JSON.stringify(reply) + "\n")
    process.exit(0)
  }
  console.log(JSON.stringify(reply))
}
