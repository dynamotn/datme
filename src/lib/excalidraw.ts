/**
 * Excalidraw drawings drawn by datme itself, from the scene the Obsidian
 * Excalidraw plugin stores in `.excalidraw.md` (or a plain `.excalidraw`),
 * so a drawing needs no SVG exported by hand. Shapes go through roughjs with
 * each element's own seed, as Excalidraw draws them, so they look the same.
 */
// lz-string is CommonJS: named imports fail under Vite and Node.
import LZString from "lz-string"
import rough from "roughjs"
import type { Options as RoughOptions } from "roughjs/bin/core"
import { getStroke } from "perfect-freehand"

type Point = [number, number]

export interface ExElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  angle?: number
  strokeColor?: string
  backgroundColor?: string
  fillStyle?: string
  strokeWidth?: number
  strokeStyle?: string
  roughness?: number
  opacity?: number
  seed?: number
  roundness?: { type: number; value?: number } | null
  isDeleted?: boolean
  points?: Point[]
  pressures?: number[]
  simulatePressure?: boolean
  startArrowhead?: string | null
  endArrowhead?: string | null
  polygon?: boolean
  text?: string
  fontSize?: number
  fontFamily?: number
  textAlign?: string
  verticalAlign?: string
  lineHeight?: number
  fileId?: string
  scale?: [number, number]
}

export interface Scene {
  elements: ExElement[]
  background: string
  /** Image of each file id: a data: URL from the scene, or a vault file named in the note. */
  files: Record<string, { dataURL?: string; link?: string }>
}

export class DrawingError extends Error {}

// ---------- reading ----------

/** The scene of a `.excalidraw.md` note or of a plain `.excalidraw` JSON file. */
export function parseDrawing(src: string): Scene {
  let json: string | undefined
  const compressed = src.match(/```compressed-json\s*\n([\s\S]*?)```/)
  if (compressed) {
    json = LZString.decompressFromBase64(compressed[1].replace(/\s+/g, "")) ?? undefined
    if (!json) throw new DrawingError("the compressed drawing cannot be read")
  } else {
    const plain = src.match(/```json\s*\n([\s\S]*?)```/)
    json = plain ? plain[1] : src.trimStart().startsWith("{") ? src : undefined
  }
  if (!json) throw new DrawingError("no drawing found; is it an Excalidraw file?")
  let data: { elements?: ExElement[]; appState?: { viewBackgroundColor?: string }; files?: Record<string, { dataURL?: string }> }
  try {
    data = JSON.parse(json)
  } catch {
    throw new DrawingError("the drawing is not valid JSON")
  }
  const files: Scene["files"] = { ...(data.files ?? {}) }
  // The plugin names embedded images below the drawing: `fileId: [[image.png]]`.
  for (const m of src.matchAll(/^([0-9a-f]{20,64}):\s*(?:!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|(https?:\/\/\S+))\s*$/gim)) {
    files[m[1]] = { ...files[m[1]], link: m[2] ?? m[3] }
  }
  // Text the plugin keeps in "Text Elements" when the scene leaves it out: `text ^elementId`.
  const texts = new Map<string, string>()
  const section = src.match(/^#+ Text Elements\s*\n([\s\S]*?)(?=^#+ |^%%|```)/m)?.[1] ?? ""
  for (const m of section.matchAll(/([\s\S]*?)\s\^([\w-]+)\s*(?:\n|$)/g)) texts.set(m[2], m[1].trim())
  const elements = (data.elements ?? [])
    .filter((e) => !e.isDeleted)
    .map((e) => (e.type === "text" && !e.text && texts.has(e.id) ? { ...e, text: texts.get(e.id) } : e))
  return { elements, background: data.appState?.viewBackgroundColor ?? "#ffffff", files }
}

// ---------- drawing ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const transparent = (c: string | undefined) => !c || c === "transparent"

/** Font families of Excalidraw, by the number it stores. */
const FONTS: Record<number, string> = {
  1: "Virgil, Excalifont",
  2: "Helvetica, Arial",
  3: "'Cascadia Code', 'Cascadia Mono', ui-monospace, monospace",
  5: "Excalifont, Virgil",
  6: "Nunito",
  7: "'Lilita One'",
  8: "'Comic Shanns', 'Comic Sans MS'",
}
const FALLBACK = "'Segoe UI Emoji', sans-serif"

/** roughjs options as Excalidraw derives them from an element. */
function roughOptions(e: ExElement, fill = true): RoughOptions {
  const sw = e.strokeWidth ?? 2
  const dashed = e.strokeStyle === "dashed"
  const dotted = e.strokeStyle === "dotted"
  const o: RoughOptions = {
    seed: e.seed ?? 1,
    stroke: e.strokeColor ?? "#1e1e1e",
    strokeWidth: dashed || dotted ? sw + 0.5 : sw,
    roughness: e.roughness ?? 1,
    disableMultiStroke: dashed || dotted,
    strokeLineDash: dashed ? [8, 8 + sw] : dotted ? [1.5, 6 + sw] : undefined,
    fillWeight: sw / 2,
    hachureGap: sw * 4,
    preserveVertices: (e.roughness ?? 1) < 2,
  }
  if (fill && !transparent(e.backgroundColor)) {
    o.fill = e.backgroundColor
    o.fillStyle = e.fillStyle === "solid" ? "solid" : e.fillStyle === "cross-hatch" ? "cross-hatch" : e.fillStyle === "zigzag" ? "zigzag" : "hachure"
  }
  return o
}

const generator = rough.generator()

/** SVG paths of a roughjs drawable; a dash only applies to the outline, not to the fill's hatching. */
function paths(drawable: ReturnType<typeof generator.rectangle>, dash?: number[]): string {
  const outline = drawable.options.stroke
  return generator
    .toPaths(drawable)
    .map((p) => {
      const dashAttr = dash && p.fill === "none" && p.stroke === outline ? ` stroke-dasharray="${dash.join(" ")}"` : ""
      return `<path d="${p.d}" stroke="${esc(p.stroke)}" stroke-width="${p.strokeWidth}" fill="${esc(p.fill ?? "none")}"${dashAttr}/>`
    })
    .join("")
}

/** A rounded rectangle path, with Excalidraw's corner radius. */
function roundedRect(w: number, h: number, roundness: NonNullable<ExElement["roundness"]>): string {
  // Type 3 is "adaptive": 32px, unless the shape is small; older drawings use a quarter of the side.
  const r = roundness.type === 3 ? Math.min(roundness.value ?? 32, Math.min(w, h) / 4) : Math.min(w, h) * 0.25
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0`
}

function arrowhead(kind: string, tip: Point, from: Point, e: ExElement): string {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0])
  const len = Math.min(30, Math.hypot(tip[0] - from[0], tip[1] - from[1]) / 2)
  const at = (a: number, l: number): Point => [tip[0] - l * Math.cos(angle + a), tip[1] - l * Math.sin(angle + a)]
  const o = { ...roughOptions(e, false), strokeLineDash: undefined }
  if (kind === "dot" || kind === "circle") return paths(generator.circle(tip[0], tip[1], Math.min(15, len), { ...o, fill: e.strokeColor, fillStyle: "solid" }))
  if (kind === "bar") return paths(generator.linearPath([at(Math.PI / 2, -len / 2), at(Math.PI / 2, len / 2)], o))
  if (kind === "triangle") return paths(generator.polygon([tip, at(0.4, len), at(-0.4, len)], { ...o, fill: e.strokeColor, fillStyle: "solid" }))
  return paths(generator.linearPath([at(0.35, len), tip, at(-0.35, len)], o))
}

/** The outline of a freehand stroke as a closed path, as perfect-freehand's documentation draws it. */
function freehandPath(e: ExElement): string {
  const pts = (e.points ?? []).map((p, i) => [p[0], p[1], e.pressures?.[i] ?? 0.5])
  const outline = getStroke(pts, {
    size: (e.strokeWidth ?? 2) * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    last: true,
    simulatePressure: e.simulatePressure ?? true,
  })
  if (!outline.length) return ""
  const d = outline.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0.toFixed(2), y0.toFixed(2), ((x0 + x1) / 2).toFixed(2), ((y0 + y1) / 2).toFixed(2))
      return acc
    },
    ["M", outline[0][0].toFixed(2), outline[0][1].toFixed(2), "Q"],
  )
  return `<path d="${d.join(" ")} Z" fill="${esc(e.strokeColor ?? "#1e1e1e")}"/>`
}

function textSvg(e: ExElement): string {
  const size = e.fontSize ?? 20
  const lh = (e.lineHeight ?? 1.25) * size
  const lines = (e.text ?? "").split("\n")
  const anchor = e.textAlign === "center" ? "middle" : e.textAlign === "right" ? "end" : "start"
  const x = e.textAlign === "center" ? e.width / 2 : e.textAlign === "right" ? e.width : 0
  const font = `${FONTS[e.fontFamily ?? 5] ?? FONTS[5]}, ${FALLBACK}`
  const tspans = lines.map((l, i) => `<tspan x="${x}" y="${((i + 0.5) * lh).toFixed(2)}">${esc(l) || " "}</tspan>`).join("")
  return `<text font-family="${esc(font)}" font-size="${size}" fill="${esc(e.strokeColor ?? "#1e1e1e")}" text-anchor="${anchor}" dominant-baseline="middle" style="white-space:pre">${tspans}</text>`
}

/** The shape of one element, drawn at the origin; the caller moves and turns it. */
function shape(e: ExElement, image: (fileId: string) => string | undefined): string {
  const w = e.width
  const h = e.height
  const dash = roughOptions(e).strokeLineDash
  switch (e.type) {
    case "rectangle":
      return e.roundness ? paths(generator.path(roundedRect(w, h, e.roundness), roughOptions(e)), dash) : paths(generator.rectangle(0, 0, w, h, roughOptions(e)), dash)
    case "diamond":
      return paths(generator.polygon([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]], roughOptions(e)), dash)
    case "ellipse":
      return paths(generator.ellipse(w / 2, h / 2, w, h, roughOptions(e)), dash)
    case "line":
    case "arrow": {
      const pts = e.points ?? []
      if (pts.length < 2) return ""
      const closed = e.type === "line" && (e.polygon || (pts.length > 2 && pts[0][0] === pts.at(-1)![0] && pts[0][1] === pts.at(-1)![1]))
      const body = closed
        ? generator.polygon(pts, roughOptions(e))
        : e.roundness && pts.length > 2
          ? generator.curve(pts, roughOptions(e, false))
          : generator.linearPath(pts, roughOptions(e, false))
      let out = paths(body, dash)
      if (e.type === "arrow") {
        if (e.endArrowhead) out += arrowhead(e.endArrowhead, pts.at(-1)!, pts.at(-2)!, e)
        if (e.startArrowhead) out += arrowhead(e.startArrowhead, pts[0], pts[1], e)
      }
      return out
    }
    case "freedraw":
      return freehandPath(e)
    case "text":
      return textSvg(e)
    case "image": {
      const href = e.fileId ? image(e.fileId) : undefined
      if (!href) return ""
      const [sx, sy] = e.scale ?? [1, 1]
      const flip = sx < 0 || sy < 0 ? ` transform="translate(${sx < 0 ? w : 0} ${sy < 0 ? h : 0}) scale(${Math.sign(sx) || 1} ${Math.sign(sy) || 1})"` : ""
      return `<image href="${esc(href)}" width="${w}" height="${h}" preserveAspectRatio="none"${flip}/>`
    }
    default:
      // Frames, embeds and other interactive elements have nothing to show on a static page.
      return ""
  }
}

/** Corners an element covers on the canvas, turned with it. */
function bounds(e: ExElement): Point[] {
  let x0 = 0
  let y0 = 0
  let x1 = e.width
  let y1 = e.height
  if (e.points?.length) {
    x0 = Math.min(...e.points.map((p) => p[0]))
    y0 = Math.min(...e.points.map((p) => p[1]))
    x1 = Math.max(...e.points.map((p) => p[0]))
    y1 = Math.max(...e.points.map((p) => p[1]))
  }
  const cx = e.width / 2
  const cy = e.height / 2
  const a = e.angle ?? 0
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([px, py]) => {
    const dx = px - cx
    const dy = py - cy
    return [e.x + cx + dx * Math.cos(a) - dy * Math.sin(a), e.y + cy + dx * Math.sin(a) + dy * Math.cos(a)]
  })
}

const PADDING = 10

/** The scene as an SVG, framed like Excalidraw's own export. */
export function renderScene(scene: Scene, image: (fileId: string) => string | undefined = (id) => scene.files[id]?.dataURL): string {
  const visible = scene.elements.filter((e) => !["frame", "magicframe", "embeddable", "iframe"].includes(e.type))
  if (!visible.length) throw new DrawingError("the drawing is empty")
  const corners = visible.flatMap(bounds)
  const minX = Math.min(...corners.map((p) => p[0])) - PADDING
  const minY = Math.min(...corners.map((p) => p[1])) - PADDING
  const width = Math.max(...corners.map((p) => p[0])) - minX + PADDING
  const height = Math.max(...corners.map((p) => p[1])) - minY + PADDING
  const body = visible
    .map((e) => {
      const inner = shape(e, image)
      if (!inner) return ""
      const turn = e.angle ? ` rotate(${((e.angle * 180) / Math.PI).toFixed(3)} ${e.width / 2} ${e.height / 2})` : ""
      const opacity = e.opacity != null && e.opacity < 100 ? ` opacity="${e.opacity / 100}"` : ""
      return `<g transform="translate(${e.x} ${e.y})${turn}"${opacity} stroke-linecap="round">${inner}</g>`
    })
    .join("")
  const bg = transparent(scene.background) ? "" : `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${esc(scene.background)}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}" width="${Math.round(width)}" height="${Math.round(height)}" role="img">${bg}${body}</svg>`
}
