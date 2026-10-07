/**
 * Excalidraw drawings drawn by datme itself, from the scene the Obsidian
 * Excalidraw plugin stores in `.excalidraw.md` (or a plain `.excalidraw`),
 * so a drawing needs no SVG exported by hand. Shapes go through roughjs with
 * each element's own seed, as Excalidraw draws them, so they look the same.
 *
 * Like the plugin, it knows links on elements and in text, frames (outlined,
 * named, clipping what they hold), embedded images, drawings, notes and LaTeX,
 * parts of a drawing (`#^frame=`, `#^clippedframe=`, `#^group=`, `#^area=`)
 * and the plugin's export settings in the frontmatter.
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
  groupIds?: string[]
  frameId?: string | null
  /** A [[wikilink]] or URL the element points to. */
  link?: string | null
  /** Name of a frame. */
  name?: string | null
  points?: Point[]
  pressures?: number[]
  simulatePressure?: boolean
  startArrowhead?: string | null
  endArrowhead?: string | null
  polygon?: boolean
  text?: string
  rawText?: string
  originalText?: string
  fontSize?: number
  fontFamily?: number
  textAlign?: string
  verticalAlign?: string
  lineHeight?: number
  fileId?: string | null
  scale?: [number, number]
  crop?: { x: number; y: number; width: number; height: number; naturalWidth: number; naturalHeight: number } | null
}

/** What the plugin lists under "Embedded Files": a vault file, a web address or a formula. */
export type Embedded = { kind: "file"; target: string } | { kind: "url"; url: string } | { kind: "latex"; tex: string }

export interface Scene {
  elements: ExElement[]
  background: string
  files: Record<string, { dataURL?: string; embed?: Embedded }>
  /** The plugin's export settings, from the frontmatter. */
  exportOptions: { transparent?: boolean; dark?: boolean; padding?: number }
}

export class DrawingError extends Error {}

// ---------- reading ----------

function frontmatter(src: string): Record<string, string> {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ""
  const out: Record<string, string> = {}
  for (const m of fm.matchAll(/^([\w-]+):\s*(.*?)\s*$/gm)) out[m[1]] = m[2].replace(/^["']|["']$/g, "")
  return out
}

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
  const files: Scene["files"] = {}
  for (const [id, f] of Object.entries(data.files ?? {})) files[id] = { dataURL: f.dataURL }
  // The plugin lists embedded files below the drawing: `fileId: [[image.png]]`, a URL, or `$$formula$$`.
  for (const m of src.matchAll(/^([0-9a-f]{20,64}):\s*(.+?)\s*$/gim)) {
    const value = m[2]
    const link = value.match(/^!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/)
    const embed: Embedded | undefined = link
      ? { kind: "file", target: link[1].trim() }
      : /^https?:\/\//.test(value)
        ? { kind: "url", url: value }
        : value.startsWith("$$") && value.endsWith("$$") && value.length > 4
          ? { kind: "latex", tex: value.slice(2, -2) }
          : undefined
    if (embed) files[m[1]] = { ...files[m[1]], embed }
  }
  // Text the plugin keeps in "Text Elements" when the scene leaves it out: `text ^elementId`.
  const texts = new Map<string, string>()
  const section = src.match(/^#+ Text Elements\s*\n([\s\S]*?)(?=^#+ |^%%|```)/m)?.[1] ?? ""
  for (const m of section.matchAll(/([\s\S]*?)\s\^([\w-]+)\s*(?:\n|$)/g)) texts.set(m[2], m[1].trim())
  const elements = (data.elements ?? [])
    .filter((e) => !e.isDeleted)
    .map((e) => (e.type === "text" && !e.text && texts.has(e.id) ? { ...e, text: texts.get(e.id) } : e))
  const fm = frontmatter(src)
  const padding = Number(fm["excalidraw-export-padding"])
  return {
    elements,
    background: data.appState?.viewBackgroundColor ?? "#ffffff",
    files,
    exportOptions: {
      transparent: fm["excalidraw-export-transparent"] === "true",
      dark: fm["excalidraw-export-dark"] === "true",
      padding: Number.isFinite(padding) && fm["excalidraw-export-padding"] !== undefined ? padding : undefined,
    },
  }
}

/** The part of a drawing an embed asks for, in the plugin's syntax. */
export type Selection =
  | { kind: "frame" | "clippedframe" | "group" | "area"; id: string }
  | { kind: "frameName"; name: string }

/** `^frame=ID`, `^clippedframe=ID`, `^group=ID`, `^area=ID`, `^ID` (an area) or a frame's name. */
export function parseSelection(fragment: string): Selection | undefined {
  const f = fragment.trim()
  if (!f) return undefined
  const m = f.match(/^\^(frame|clippedframe|group|area)=(.+)$/)
  if (m) return { kind: m[1] as "frame", id: m[2] }
  if (f.startsWith("^")) return { kind: "area", id: f.slice(1) }
  return { kind: "frameName", name: f }
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

/** What an embedded file shows. */
export type FileView =
  | { kind: "image"; href: string }
  /** Another drawing, drawn inside this one. */
  | { kind: "drawing"; viewBox: string; body: string }
  /** A note: a card with its title, linking to it when it is published. */
  | { kind: "note"; title: string; href?: string }
  /** A formula as MathML. */
  | { kind: "math"; mathml: string }

export interface RenderOptions {
  /** What a file id shows; by default the image the scene itself carries. */
  resolveFile?(fileId: string): FileView | undefined
  /** Where a [[wikilink]] or URL of the drawing leads; undefined leaves it as plain text. */
  resolveLink?(target: string): string | undefined
  /** Only this part of the drawing. */
  select?: Selection
  /** Makes clip-path ids unique when several drawings share a page. */
  idPrefix?: string
}

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

/** Every arrowhead of Excalidraw: arrow, bar, dot, triangle, diamond, their outlined forms and crow's feet. */
function arrowhead(kind: string, tip: Point, from: Point, e: ExElement): string {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0])
  const len = Math.min(30, Math.hypot(tip[0] - from[0], tip[1] - from[1]) / 2)
  // u points back along the line, v across it.
  const u: Point = [-Math.cos(angle), -Math.sin(angle)]
  const v: Point = [-u[1], u[0]]
  const p = (back: number, side: number): Point => [tip[0] + u[0] * back + v[0] * side, tip[1] + u[1] * back + v[1] * side]
  const at = (a: number, l: number): Point => [tip[0] - l * Math.cos(angle + a), tip[1] - l * Math.sin(angle + a)]
  const o = { ...roughOptions(e, false), strokeLineDash: undefined }
  const solid = { ...o, fill: e.strokeColor ?? "#1e1e1e", fillStyle: "solid" }
  switch (kind) {
    case "dot":
    case "circle":
      return paths(generator.circle(...p(len / 4, 0), len / 2, solid))
    case "circle_outline":
      return paths(generator.circle(...p(len / 4, 0), len / 2, o))
    case "bar":
      return paths(generator.linearPath([p(0, -len / 2), p(0, len / 2)], o))
    case "triangle":
      return paths(generator.polygon([tip, at(0.4, len), at(-0.4, len)], solid))
    case "triangle_outline":
      return paths(generator.polygon([tip, at(0.4, len), at(-0.4, len)], o))
    case "diamond":
      return paths(generator.polygon([tip, p(len / 2, len / 4), p(len, 0), p(len / 2, -len / 4)], solid))
    case "diamond_outline":
      return paths(generator.polygon([tip, p(len / 2, len / 4), p(len, 0), p(len / 2, -len / 4)], o))
    case "crowfoot_one":
      return paths(generator.linearPath([p(len / 2, -len / 2), p(len / 2, len / 2)], o))
    case "crowfoot_many":
      return paths(generator.linearPath([p(0, -len / 2), p(len, 0), p(0, len / 2)], o))
    case "crowfoot_one_or_many":
      return arrowhead("crowfoot_many", tip, from, e) + paths(generator.linearPath([p(len, -len / 2), p(len, len / 2)], o))
    default:
      return paths(generator.linearPath([at(0.35, len), tip, at(-0.35, len)], o))
  }
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

/** Links in a line of text: [[target|alias]], [[target]] and [text](url), with what a reader sees of them. */
export function textLinks(line: string): { text: string; target?: string }[] {
  const out: { text: string; target?: string }[] = []
  let last = 0
  for (const m of line.matchAll(/\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) })
    if (m[1]) out.push({ text: m[3] ?? m[1].split("/").pop()!.replace(/\.md$/, ""), target: m[1] })
    else out.push({ text: m[4], target: m[5] })
    last = m.index + m[0].length
  }
  if (last < line.length || !out.length) out.push({ text: line.slice(last) })
  return out
}

function textSvg(e: ExElement, link: (target: string) => string | undefined): string {
  const size = e.fontSize ?? 20
  const lh = (e.lineHeight ?? 1.25) * size
  const lines = (e.text ?? "").split("\n")
  const anchor = e.textAlign === "center" ? "middle" : e.textAlign === "right" ? "end" : "start"
  const x = e.textAlign === "center" ? e.width / 2 : e.textAlign === "right" ? e.width : 0
  const font = `${FONTS[e.fontFamily ?? 5] ?? FONTS[5]}, ${FALLBACK}`
  const tspans = lines
    .map((line, i) => {
      // The first part of a line places it; the rest follow on, so the line still aligns as one.
      const parts = textLinks(line).map((part, j) => {
        const pos = j === 0 ? ` x="${x}" y="${((i + 0.5) * lh).toFixed(2)}"` : ""
        // dominant-baseline is not inherited through <a> everywhere, so each part carries it.
        const span = `<tspan${pos} dominant-baseline="middle">${esc(part.text) || (j === 0 ? " " : "")}</tspan>`
        const href = part.target ? link(part.target) : undefined
        return href ? `<a href="${esc(href)}" class="drawing-link">${span}</a>` : span
      })
      return parts.join("")
    })
    .join("")
  return `<text font-family="${esc(font)}" font-size="${size}" fill="${esc(e.strokeColor ?? "#1e1e1e")}" text-anchor="${anchor}" dominant-baseline="middle" style="white-space:pre">${tspans}</text>`
}

function imageSvg(e: ExElement, view: FileView | undefined, prefix: string): string {
  const w = e.width
  const h = e.height
  if (!view) return ""
  if (view.kind === "drawing") return `<svg viewBox="${view.viewBox}" width="${w}" height="${h}">${view.body}</svg>`
  if (view.kind === "note") {
    const card = `<rect width="${w}" height="${h}" rx="8" fill="#ffffff" stroke="#c0c0c0"/><text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle" font-family="${esc(`${FONTS[5]}, ${FALLBACK}`)}" font-size="${Math.max(12, Math.min(28, h / 4))}" fill="#1e1e1e">📄 ${esc(view.title)}</text>`
    return view.href ? `<a href="${esc(view.href)}" class="drawing-link">${card}</a>` : card
  }
  if (view.kind === "math") {
    // MathML renders in the browser inside a foreignObject, sized to the element.
    return `<foreignObject width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${Math.max(10, h / 2.2).toFixed(1)}px">${view.mathml}</div></foreignObject>`
  }
  const [sx, sy] = e.scale ?? [1, 1]
  const flip = sx < 0 || sy < 0 ? ` transform="translate(${sx < 0 ? w : 0} ${sy < 0 ? h : 0}) scale(${Math.sign(sx) || 1} ${Math.sign(sy) || 1})"` : ""
  const c = e.crop
  // A cropped image shows only its window of the picture.
  if (c && c.width > 0 && c.height > 0) {
    return `<svg viewBox="${c.x} ${c.y} ${c.width} ${c.height}" width="${w}" height="${h}" preserveAspectRatio="none"${flip}><image href="${esc(view.href)}" width="${c.naturalWidth}" height="${c.naturalHeight}"/></svg>`
  }
  const round = e.roundness ? ` clip-path="url(#${prefix}r-${esc(e.id)})"` : ""
  const clip = e.roundness ? `<clipPath id="${prefix}r-${esc(e.id)}"><rect width="${w}" height="${h}" rx="${Math.min(w, h) * 0.1}"/></clipPath>` : ""
  return `${clip}<image href="${esc(view.href)}" width="${w}" height="${h}" preserveAspectRatio="none"${flip}${round}/>`
}

/** The shape of one element, drawn at the origin; the caller moves and turns it. */
function shape(e: ExElement, opts: Required<Pick<RenderOptions, "resolveFile" | "resolveLink">> & { prefix: string }): string {
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
      return textSvg(e, opts.resolveLink)
    case "image":
      return imageSvg(e, e.fileId ? opts.resolveFile(e.fileId) : undefined, opts.prefix)
    default:
      // Frames are drawn apart; embeds and other interactive elements have nothing to show on a page.
      return ""
  }
}

type Box = { x0: number; y0: number; x1: number; y1: number }

/** Corners an element covers on the canvas, turned with it. */
function corners(e: ExElement): Point[] {
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

function boxOf(elements: ExElement[]): Box {
  const pts = elements.flatMap(corners)
  return {
    x0: Math.min(...pts.map((p) => p[0])),
    y0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])),
    y1: Math.max(...pts.map((p) => p[1])),
  }
}

/** Excalidraw's export padding. */
const PADDING = 10
/** Room above a frame for its name. */
const FRAME_LABEL = 22
const FRAMES = ["frame", "magicframe"]
const HIDDEN = ["embeddable", "iframe", "selection"]

export interface Parts {
  viewBox: string
  width: number
  height: number
  /** Everything inside the <svg>: background, clip paths and elements. */
  body: string
  dark: boolean
}

/** The drawing, or the part of it the selection names, ready to wrap in an <svg>. */
export function renderParts(scene: Scene, options: RenderOptions = {}): Parts {
  const prefix = (options.idPrefix ?? "ex") + "-"
  const opts = {
    resolveFile: options.resolveFile ?? ((id: string) => (scene.files[id]?.dataURL ? { kind: "image" as const, href: scene.files[id].dataURL! } : undefined)),
    resolveLink: options.resolveLink ?? ((t: string) => (/^https?:\/\//.test(t) ? t : undefined)),
    prefix,
  }
  const all = scene.elements.filter((e) => !HIDDEN.includes(e.type))
  const byId = new Map(all.map((e) => [e.id, e]))
  let shown = all
  let view: Box | undefined
  let clipTo: ExElement | undefined
  let drawFrames = true
  let padding = scene.exportOptions.padding ?? PADDING
  const sel = options.select
  if (sel) {
    const frame =
      sel.kind === "frameName"
        ? all.find((e) => FRAMES.includes(e.type) && (e.name ?? "").toLowerCase() === sel.name.toLowerCase())
        : sel.kind === "frame" || sel.kind === "clippedframe"
          ? byId.get(sel.id)
          : undefined
    if (sel.kind === "frameName" || sel.kind === "frame" || sel.kind === "clippedframe") {
      if (!frame || !FRAMES.includes(frame.type)) throw new DrawingError(`no frame ${sel.kind === "frameName" ? `named "${sel.name}"` : `"${sel.id}"`} in the drawing`)
      shown = all.filter((e) => e.frameId === frame.id)
      drawFrames = false
      if (sel.kind === "clippedframe") {
        // Exactly the frame, what overflows it cut off.
        clipTo = frame
        view = boxOf([frame])
        padding = 0
      } else view = boxOf([frame, ...shown])
    } else if (sel.kind === "group") {
      const el = byId.get(sel.id)
      const group = el?.groupIds?.at(-1)
      if (!el) throw new DrawingError(`no element "${sel.id}" in the drawing`)
      shown = group ? all.filter((e) => e.groupIds?.includes(group)) : [el]
      view = boxOf(shown)
    } else {
      const el = byId.get(sel.id)
      if (!el) throw new DrawingError(`no element "${sel.id}" in the drawing`)
      // The area around one element, with whatever else lies in it.
      view = boxOf([el])
    }
  }
  const drawable = shown.filter((e) => !FRAMES.includes(e.type) || drawFrames)
  if (!drawable.some((e) => !FRAMES.includes(e.type))) throw new DrawingError("the drawing is empty")
  if (!view) {
    view = boxOf(drawable)
    if (drawable.some((e) => FRAMES.includes(e.type) && e.name !== "")) view.y0 -= FRAME_LABEL
  }
  const minX = view.x0 - padding
  const minY = view.y0 - padding
  const width = view.x1 - view.x0 + padding * 2
  const height = view.y1 - view.y0 + padding * 2

  const defs: string[] = []
  const frameIds = new Set(drawable.filter((e) => FRAMES.includes(e.type)).map((e) => e.id))
  for (const f of [...drawable.filter((e) => frameIds.has(e.id)), ...(clipTo ? [clipTo] : [])]) {
    defs.push(`<clipPath id="${prefix}f-${esc(f.id)}"><rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}"/></clipPath>`)
  }
  const body = drawable
    .map((e) => {
      if (FRAMES.includes(e.type)) {
        // Frames as Excalidraw shows them: a light outline with the frame's name above.
        const name = e.name ?? "Frame"
        return `<g class="drawing-frame"><rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="8" fill="none" stroke="#bbb" stroke-width="2"/>${name ? `<text x="${e.x}" y="${e.y - 6}" font-family="${esc(FALLBACK)}" font-size="14" fill="#999">${esc(name)}</text>` : ""}</g>`
      }
      const inner = shape(e, opts)
      if (!inner) return ""
      const turn = e.angle ? ` rotate(${((e.angle * 180) / Math.PI).toFixed(3)} ${e.width / 2} ${e.height / 2})` : ""
      const opacity = e.opacity != null && e.opacity < 100 ? ` opacity="${e.opacity / 100}"` : ""
      let g = `<g transform="translate(${e.x} ${e.y})${turn}"${opacity} stroke-linecap="round">${inner}</g>`
      const target = e.link ? e.link.replace(/^\[\[|\]\]$/g, "").split("|") : undefined
      const href = target ? opts.resolveLink(target[0]) : undefined
      // A shape has no words of its own: the link is named after where it leads.
      const label = target ? (target[1] ?? target[0].split("/").pop()!.replace(/\.md$/, "")) : ""
      if (href) g = `<a href="${esc(href)}" class="drawing-link" aria-label="${esc(label)}">${g}</a>`
      // What a frame holds stays inside it, as in Excalidraw.
      const frame = clipTo?.id ?? (e.frameId && frameIds.has(e.frameId) ? e.frameId : undefined)
      return frame ? `<g clip-path="url(#${prefix}f-${esc(frame)})">${g}</g>` : g
    })
    .join("")
  const bg =
    transparent(scene.background) || scene.exportOptions.transparent
      ? ""
      : `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${esc(scene.background)}"/>`
  return {
    viewBox: `${minX.toFixed(2)} ${minY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`,
    width,
    height,
    body: `${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${bg}${body}`,
    dark: scene.exportOptions.dark === true,
  }
}

/** The scene as an SVG, framed like Excalidraw's own export. */
export function renderScene(scene: Scene, options: RenderOptions = {}): string {
  const p = renderParts(scene, options)
  // A drawing exported dark stays dark; the page's dark theme leaves it alone.
  const dark = p.dark ? ' data-dark=""' : ""
  // A drawing with links is a group a reader can step into; without, it is one image.
  const role = p.body.includes('class="drawing-link"') ? "group" : "img"
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${p.viewBox}" width="${Math.round(p.width)}" height="${Math.round(p.height)}" role="${role}"${dark}>${p.body}</svg>`
}
