/**
 * Generates a large vault to benchmark datme on: notes in nested folders,
 * wikilinks (and so backlinks) with a few hubs, note and heading embeds,
 * pictures, tags, Dataview queries, a protected note, and notes in two
 * languages, some of them in one file. Everything comes from a seed, so the
 * same seed and size always write the same bytes.
 *
 * `bun tools/bench-vault.ts [--notes 10000] [--seed 1] [--out dir]` writes it
 * (to a new temporary directory by default) and prints where; `tools/bench.ts`
 * builds and serves it.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"
import zlib from "node:zlib"

export interface VaultOptions {
  /** How many notes, the home page aside. */
  notes?: number
  seed?: number
}

export interface Vault {
  /** Every file, by its path in the vault (always with `/`), in a fixed order. */
  files: Map<string, string | Uint8Array>
  /** The note the benchmark edits in `datme dev`: a plain one, in the middle of the vault. */
  probe: string
  /** The protected note. */
  locked: string
}

/** A small, fast, seedable generator (mulberry32): the same seed gives the same numbers on every machine. */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = (
  "garden seed soil root leaf stem branch bloom compost mulch water light shade season spring summer autumn winter " +
  "note idea thought link card wall notebook index slip box memory habit practice reading writing question answer " +
  "pattern system network graph node edge path trail map field forest meadow river stone moss fern oak maple willow " +
  "method principle model theory example evidence claim argument source quote summary outline draft revision essay " +
  "small large quiet slow careful patient open simple deep wide early late common rare useful curious gentle steady " +
  "grows tends plants waters prunes gathers connects revisits returns follows explains compares questions collects"
).split(" ")

/** Vietnamese words for the notes and parts written in the second language. */
const TU = (
  "vườn hạt đất rễ lá thân cành hoa phân nước ánh sáng bóng mùa xuân hạ thu đông ghi chú ý tưởng suy nghĩ liên kết " +
  "thẻ tường sổ tay mục lục trí nhớ thói quen đọc viết câu hỏi trả lời mẫu hệ thống mạng đồ thị lối đi bản đồ cánh đồng " +
  "rừng sông đá rêu phương pháp nguyên tắc ví dụ bằng chứng nguồn tóm tắt bản nháp nhỏ lớn yên tĩnh chậm cẩn thận sâu rộng"
).split(" ")

const TAGS = ["soil", "seeds", "reading", "writing", "method", "systems", "people", "places", "tools", "questions", "garden", "memory"]
const SUBTAGS = ["notes", "ideas", "open", "done", "review"]

/** Notes in a folder, and folders in an area. */
const PER_FOLDER = 100
const FOLDERS_PER_AREA = 5
/** Pictures notes embed: few, so most of them are shared, as screenshots and diagrams are. */
const PICTURES = 12

const pad = (n: number) => String(n).padStart(5, "0")
const noteName = (i: number) => `Note-${pad(i)}`
function notePath(i: number): string {
  const folder = Math.floor(i / PER_FOLDER)
  const area = Math.floor(folder / FOLDERS_PER_AREA)
  return `Area-${String(area).padStart(2, "0")}/Topic-${String(folder).padStart(3, "0")}/${noteName(i)}.md`
}
const pictureName = (k: number) => `picture-${String(k).padStart(2, "0")}.png`

/** A picture of `width`×`height` pixels: a gradient, stored without compression so its bytes never depend on zlib's version. */
export function png(width: number, height: number, hue: number): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, "latin1"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(body))
    return Buffer.concat([head, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8 bits, RGB, deflate, no filter, no interlace
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) {
      rows[row + 1 + x * 3] = (hue + x) & 255
      rows[row + 2 + x * 3] = (hue * 3 + y) & 255
      rows[row + 3 + x * 3] = (x + y) & 255
    }
  }
  const data = zlib.deflateSync(rows, { level: 0 })
  return new Uint8Array(
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", data), chunk("IEND", Buffer.alloc(0))]),
  )
}

/** Generates the vault in memory; see `writeVault` to put it on disk. */
export function generateVault({ notes = 10000, seed = 1 }: VaultOptions = {}): Vault {
  if (!Number.isInteger(notes) || notes < 10) throw new Error(`a benchmark vault needs at least 10 notes, not ${notes}`)
  const rand = random(seed)
  const int = (n: number) => Math.floor(rand() * n)
  const pick = <T>(list: readonly T[]) => list[int(list.length)]!
  const words = (list: readonly string[], n: number) => Array.from({ length: n }, () => pick(list)).join(" ")
  const sentence = (list: readonly string[]) => {
    const s = words(list, 6 + int(10))
    return s[0]!.toUpperCase() + s.slice(1) + "."
  }
  const paragraph = (list: readonly string[], links: string[]) => {
    const parts = Array.from({ length: 3 + int(4) }, () => sentence(list))
    for (const link of links) parts.splice(int(parts.length + 1), 0, `See ${link}.`)
    return parts.join(" ")
  }
  // A link target: mostly a neighbour in the same folder, sometimes anywhere, often one of the hubs everything points to.
  const hubs = Math.max(5, Math.floor(notes / 500))
  const target = (i: number) => {
    const r = rand()
    if (r < 0.15) return int(hubs)
    if (r < 0.75) return Math.floor(i / PER_FOLDER) * PER_FOLDER + int(PER_FOLDER)
    return int(notes)
  }
  const link = (i: number) => {
    let j = target(i)
    if (j >= notes || j === i) j = (i + 1) % notes
    return rand() < 0.2 ? `[[${noteName(j)}|${words(WORDS, 2)}]]` : `[[${noteName(j)}]]`
  }

  const probe = Math.floor(notes / 2)
  const locked = notes - 1
  // Queries are rare in a vault; a few run over a folder, a tag, or everything.
  const queryEvery = Math.max(97, Math.floor(notes / 8))
  const files = new Map<string, string | Uint8Array>()
  files.set(
    "datme.yaml",
    [
      "site:",
      "  title: Benchmark garden",
      "  tagline: A generated vault",
      "  url: https://bench.example",
      "  author: Bench",
      "languages: [en-US, vi-VN]",
      "",
    ].join("\n"),
  )
  const areas = Math.ceil(notes / PER_FOLDER / FOLDERS_PER_AREA)
  files.set(
    "index.md",
    [
      "---",
      "publish: true",
      "title: Home",
      "---",
      "# Benchmark garden",
      "",
      ...Array.from({ length: areas }, (_, a) => `- [[${noteName(a * PER_FOLDER * FOLDERS_PER_AREA)}]]`),
      "",
    ].join("\n"),
  )

  for (let i = 0; i < notes; i++) {
    const vietnamese = i !== probe && i % 20 === 7
    const bilingual = i !== probe && i % 10 === 3
    const list = vietnamese ? TU : WORDS
    const created = new Date(Date.UTC(2020, 0, 1) + ((i * 37) % 2000) * 86400000).toISOString().slice(0, 10)
    const updated = new Date(Date.UTC(2025, 0, 1) + ((i * 13) % 600) * 86400000).toISOString().slice(0, 10)
    const tags = Array.from({ length: 1 + int(3) }, () => (rand() < 0.4 ? `${pick(TAGS)}/${pick(SUBTAGS)}` : pick(TAGS)))
    const front = ["---", "publish: true", `created: ${created}`, `updated: ${updated}`, `tags: [${[...new Set(tags)].join(", ")}]`]
    if (vietnamese) front.push("lang: vi-VN")
    if (i === locked) front.push("password: bench-not-a-real-secret-passphrase")
    front.push("---")

    const body: string[] = []
    const paragraphs = 2 + int(4)
    for (let p = 0; p < paragraphs; p++) {
      const links = Array.from({ length: int(3) }, () => link(i))
      body.push(paragraph(list, links), "")
      if (p === 0) body.push("## Notes", "")
    }
    if (bilingual) {
      body.push("<!--lang:en-US-->", paragraph(WORDS, []), "<!--lang:vi-VN-->", paragraph(TU, []), "<!--lang:*-->", "")
    }
    if (i % 17 === 5) body.push(`![[${pictureName(i % PICTURES)}]]`, "")
    if (i % 41 === 11) {
      const j = target(i) % notes
      body.push(`![[${noteName(j === i ? (i + 1) % notes : j)}#Notes]]`, "")
    }
    if (i % queryEvery === 13) {
      const area = notePath(i).split("/")[0]
      body.push("```dataview", `LIST FROM "${area}" WHERE contains(tags, "${pick(TAGS)}") SORT file.name LIMIT 20`, "```", "")
      body.push("```dataview", `TABLE created, updated FROM #${pick(TAGS)} SORT updated DESC LIMIT 10`, "```", "")
    }
    body.push("## Links", "", ...Array.from({ length: 1 + int(3) }, () => `- ${link(i)}`), "")
    files.set(notePath(i), [...front, ...body].join("\n"))
  }
  for (let k = 0; k < PICTURES; k++) files.set(`_assets/${pictureName(k)}`, png(320, 200, k * 21))
  return { files, probe: notePath(probe), locked: notePath(locked) }
}

/** Writes a generated vault into `dir`, creating folders as needed. */
export function writeVault(dir: string, vault: Vault): void {
  const made = new Set<string>()
  for (const [rel, content] of vault.files) {
    const file = path.join(dir, rel)
    const parent = path.dirname(file)
    if (!made.has(parent)) {
      fs.mkdirSync(parent, { recursive: true })
      made.add(parent)
    }
    fs.writeFileSync(file, content)
  }
}

/** A whole number of at least `min` from a flag, or an error naming the flag. */
export function intFlag(name: string, value: string | undefined, fallback: number, min = 0): number {
  if (value === undefined) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < min) throw new Error(`--${name} takes a whole number of at least ${min}, not "${value}"`)
  return n
}

/** The command: writes the vault and prints its directory; an error and exit code 1 otherwise. */
export function cli(args: string[]): number {
  try {
    const { values } = parseArgs({ args, options: { notes: { type: "string" }, seed: { type: "string" }, out: { type: "string" } } })
    const notes = intFlag("notes", values.notes, 10000, 10)
    const seed = intFlag("seed", values.seed, 1)
    const dir = values.out ? path.resolve(values.out) : fs.mkdtempSync(path.join(os.tmpdir(), "datme-bench-vault-"))
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`${dir} is not empty`)
    writeVault(dir, generateVault({ notes, seed }))
    console.log(dir)
    return 0
  } catch (error) {
    console.error((error as Error).message)
    return 1
  }
}

if (import.meta.main) process.exitCode = cli(process.argv.slice(2))
