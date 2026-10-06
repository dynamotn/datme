/** Obsidian's JSON Canvas format (https://jsoncanvas.org), as much as datme renders. */
export interface CanvasNode {
  id: string
  type: "text" | "file" | "link" | "group"
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  file?: string
  subpath?: string
  url?: string
  label?: string
}

export interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: Side
  toSide?: Side
  fromEnd?: "none" | "arrow"
  toEnd?: "none" | "arrow"
  color?: string
  label?: string
}

export type Side = "top" | "right" | "bottom" | "left"

export interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export function parseCanvas(src: string): CanvasData {
  const data = JSON.parse(src) as Partial<CanvasData>
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
  const nodes = (data.nodes ?? [])
    .filter((n) => n && typeof n.id === "string" && ["text", "file", "link", "group"].includes(n.type))
    .map((n) => ({ ...n, x: num(n.x), y: num(n.y), width: Math.max(1, num(n.width)), height: Math.max(1, num(n.height)) }))
  const ids = new Set(nodes.map((n) => n.id))
  const edges = (data.edges ?? []).filter((e) => e && ids.has(e.fromNode) && ids.has(e.toNode))
  return { nodes, edges }
}

/** Obsidian's six preset colours, or any CSS colour given directly. */
export function canvasColor(c: string | undefined): string | undefined {
  const presets: Record<string, string> = {
    "1": "#fb464c",
    "2": "#e9973f",
    "3": "#e0de71",
    "4": "#44cf6e",
    "5": "#53dfdd",
    "6": "#a882ff",
  }
  if (!c) return undefined
  return presets[c] ?? (/^#[0-9a-f]{3,8}$/i.test(c) ? c : undefined)
}

const center = (n: CanvasNode) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })

function anchor(n: CanvasNode, side: Side) {
  const c = center(n)
  if (side === "top") return { x: c.x, y: n.y }
  if (side === "bottom") return { x: c.x, y: n.y + n.height }
  if (side === "left") return { x: n.x, y: c.y }
  return { x: n.x + n.width, y: c.y }
}

/** Side of `from` that faces `to`, when the canvas does not say. */
function facing(from: CanvasNode, to: CanvasNode): Side {
  const a = center(from)
  const b = center(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top"
}

const NORMAL: Record<Side, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/** SVG path of an edge: a cubic curve leaving and entering perpendicular to the sides. */
export function edgePath(from: CanvasNode, to: CanvasNode, e: Pick<CanvasEdge, "fromSide" | "toSide">) {
  const fs = e.fromSide ?? facing(from, to)
  const ts = e.toSide ?? facing(to, from)
  const p = anchor(from, fs)
  const q = anchor(to, ts)
  const d = Math.max(40, Math.hypot(q.x - p.x, q.y - p.y) / 3)
  const c1 = { x: p.x + NORMAL[fs].x * d, y: p.y + NORMAL[fs].y * d }
  const c2 = { x: q.x + NORMAL[ts].x * d, y: q.y + NORMAL[ts].y * d }
  return {
    d: `M${p.x},${p.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${q.x},${q.y}`,
    mid: { x: (p.x + 3 * c1.x + 3 * c2.x + q.x) / 8, y: (p.y + 3 * c1.y + 3 * c2.y + q.y) / 8 },
  }
}

export function bounds(nodes: CanvasNode[]) {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...nodes.map((n) => n.x))
  const y = Math.min(...nodes.map((n) => n.y))
  const right = Math.max(...nodes.map((n) => n.x + n.width))
  const bottom = Math.max(...nodes.map((n) => n.y + n.height))
  return { x, y, width: right - x, height: bottom - y }
}
