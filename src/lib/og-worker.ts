/**
 * Drawing a social card or an icon as a PNG: Satori lays it out as SVG, resvg
 * rasterizes it. Satori is CPU work on the thread that calls it, so og.ts runs
 * this file in a few worker threads, cards in parallel. It imports nothing of
 * datme's own, so Node and Bun run it as it is, outside the build's bundle.
 */
import fs from "node:fs"
import { createRequire } from "node:module"
import { isMainThread, parentPort } from "node:worker_threads"
import { renderAsync } from "@resvg/resvg-js"
import satori from "satori"

/** Character subsets of the fonts: Satori only falls back between differently named fonts, so each gets its own name. */
export const SUBSETS = ["latin", "latin-ext", "vietnamese"]

type Weight = 400 | 700 | 800
let fonts: { name: string; data: Buffer; weight: Weight; style: "normal" }[] | undefined
const require = createRequire(import.meta.url)

/** Static woff files: Satori cannot read woff2 or variable fonts. */
function loadFonts() {
  if (fonts) return fonts
  const file = (pkg: string, subset: string, weight: Weight) =>
    fs.readFileSync(require.resolve(`@fontsource/${pkg}/files/${pkg}-${subset}-${weight}-normal.woff`))
  fonts = []
  for (const subset of SUBSETS) {
    for (const weight of [400, 800] as const) {
      fonts.push({ name: `Bricolage-${subset}`, data: file("bricolage-grotesque", subset, weight), weight, style: "normal" })
    }
    fonts.push({ name: `Mono-${subset}`, data: file("space-mono", subset, 700), weight: 700, style: "normal" })
  }
  return fonts
}

export async function rasterize(tree: unknown, width: number, height: number): Promise<Buffer> {
  const svg = await satori(tree as Parameters<typeof satori>[0], { width, height, fonts: loadFonts() })
  // Satori already turned text into paths; scanning system fonts would dominate the render time.
  const png = await renderAsync(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } })
  return png.asPng()
}

export interface Job {
  id: number
  tree: unknown
  width: number
  height: number
}

/** Answers a job of og.ts with its PNG, or with what went wrong. */
export async function reply(port: { postMessage(message: unknown): void }, job: Job): Promise<void> {
  try {
    port.postMessage({ id: job.id, png: await rasterize(job.tree, job.width, job.height) })
  } catch (e) {
    port.postMessage({ id: job.id, error: String(e) })
  }
}

if (!isMainThread && parentPort) parentPort.on("message", reply.bind(null, parentPort))
