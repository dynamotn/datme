import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force"
import { navigate } from "astro:transitions/client"
import { loadIndex, samePath, matchesFilter, readFilters, type NoteFilter } from "./data"

interface GNode extends SimulationNodeDatum {
  i: number
  u: string
  t: string
  deg: number
  r: number
}
interface GLink {
  source: GNode
  target: GNode
}

const live = new Set<() => void>()

/** Stop every running graph, e.g. before a page swap. */
export function teardownGraphs() {
  live.forEach((stop) => stop())
  live.clear()
}

function palette() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    node: v("--muted"),
    accent: v("--accent"),
    current: v("--clay"),
    line: v("--line-strong"),
    ink: v("--ink"),
    bg: v("--surface"),
  }
}

export async function mountGraph(canvas: HTMLCanvasElement, mode: "local" | "global", filter: NoteFilter = {}) {
  const lang = canvas.dataset.lang!
  const current = canvas.dataset.current ?? location.pathname
  const data = await loadIndex(lang)
  if (!canvas.isConnected) return

  const all = data.notes.map((n, i) => ({ i, u: n.u, t: n.t, deg: 0, r: 4 }) as GNode)
  for (const [a, b] of data.links) (all[a].deg++, all[b].deg++)
  const cur = all.find((n) => samePath(n.u, current))

  let keep = new Set(all.filter((n) => matchesFilter(data.notes[n.i], filter)).map((n) => n.i))
  if (mode === "local") {
    keep = new Set(cur ? [cur.i] : [])
    for (let depth = 0; depth < 2; depth++) {
      const next = new Set(keep)
      for (const [a, b] of data.links) {
        if (keep.has(a)) next.add(b)
        if (keep.has(b)) next.add(a)
      }
      // Stay readable: only expand to depth 2 while the graph is small.
      if (depth === 1 && next.size > 40) break
      keep = next
    }
  }
  const nodes = all.filter((n) => keep.has(n.i))
  nodes.forEach((n) => (n.r = 3 + Math.sqrt(n.deg) * 1.6))
  const links: GLink[] = data.links
    .filter(([a, b]) => keep.has(a) && keep.has(b))
    .map(([a, b]) => ({ source: all[a], target: all[b] }))
  const neighbours = new Map<GNode, Set<GNode>>()
  for (const l of links) {
    neighbours.set(l.source, (neighbours.get(l.source) ?? new Set()).add(l.target))
    neighbours.set(l.target, (neighbours.get(l.target) ?? new Set()).add(l.source))
  }

  const ctx = canvas.getContext("2d")!
  let colors = palette()
  let width = 0
  let height = 0
  const view = { k: mode === "local" ? 1 : 0.8, x: 0, y: 0 }
  let hover: GNode | undefined
  // Keep the whole graph in view until the reader pans or zooms by hand.
  let autoFit = true
  const fit = () => {
    if (!autoFit || !nodes.length || !width) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of nodes) {
      x0 = Math.min(x0, n.x! - n.r)
      y0 = Math.min(y0, n.y! - n.r)
      x1 = Math.max(x1, n.x! + n.r)
      y1 = Math.max(y1, n.y! + n.r)
    }
    // Wider horizontal padding leaves room for labels drawn around the outer nodes.
    const padX = mode === "local" ? 70 : 60
    const padY = mode === "local" ? 30 : 40
    view.k = Math.min(1.6, (width - padX * 2) / Math.max(1, x1 - x0), (height - padY * 2) / Math.max(1, y1 - y0))
    view.x = -((x0 + x1) / 2) * view.k
    view.y = -((y0 + y1) / 2) * view.k
  }

  const resize = () => {
    const dpr = window.devicePixelRatio || 1
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }

  function draw() {
    fit()
    ctx.clearRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width / 2 + view.x, height / 2 + view.y)
    ctx.scale(view.k, view.k)
    const lit = hover ? (neighbours.get(hover) ?? new Set()) : undefined
    for (const l of links) {
      const on = hover && (l.source === hover || l.target === hover)
      ctx.strokeStyle = on ? colors.accent : colors.line
      ctx.globalAlpha = hover && !on ? 0.25 : on ? 0.9 : 0.6
      ctx.lineWidth = (on ? 1.6 : 1) / view.k
      ctx.beginPath()
      ctx.moveTo(l.source.x!, l.source.y!)
      ctx.lineTo(l.target.x!, l.target.y!)
      ctx.stroke()
    }
    for (const n of nodes) {
      const isCur = n === cur
      const on = n === hover || lit?.has(n)
      ctx.globalAlpha = hover && !on && n !== hover ? 0.3 : 1
      ctx.fillStyle = isCur ? colors.current : on ? colors.accent : colors.node
      ctx.beginPath()
      ctx.arc(n.x!, n.y!, n.r, 0, Math.PI * 2)
      ctx.fill()
      if (isCur) {
        ctx.strokeStyle = colors.current
        ctx.globalAlpha = 0.3
        ctx.lineWidth = 4 / view.k
        ctx.stroke()
      }
    }
    // Labels: current, hovered and its neighbours, or everything once zoomed in.
    ctx.globalAlpha = 1
    ctx.font = `${12 / view.k}px Inter Variable, sans-serif`
    ctx.textAlign = "center"
    for (const n of nodes) {
      const show = n === cur || n === hover || lit?.has(n) || view.k > 1.6 || nodes.length < (mode === "local" ? 14 : 30)
      if (!show) continue
      ctx.globalAlpha = hover && n !== hover && !lit?.has(n) ? 0.3 : 0.95
      const label = n.t.length > 32 ? n.t.slice(0, 30) + "…" : n.t
      ctx.lineWidth = 3 / view.k
      ctx.strokeStyle = colors.bg
      ctx.strokeText(label, n.x!, n.y! - n.r - 5 / view.k)
      ctx.fillStyle = colors.ink
      ctx.fillText(label, n.x!, n.y! - n.r - 5 / view.k)
    }
    ctx.restore()
  }

  const sim: Simulation<GNode, GLink> = forceSimulation(nodes)
    .force("link", forceLink<GNode, GLink>(links).distance(mode === "local" ? 46 : 36))
    .force("charge", forceManyBody().strength(mode === "local" ? -120 : -70))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide<GNode>((n) => n.r + 3))
    .on("tick", draw)

  const toWorld = (e: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - width / 2 - view.x) / view.k,
      y: (e.clientY - rect.top - height / 2 - view.y) / view.k,
    }
  }
  const pick = (e: PointerEvent) => {
    const p = toWorld(e)
    let best: GNode | undefined
    let dist = Infinity
    for (const n of nodes) {
      const d = Math.hypot(n.x! - p.x, n.y! - p.y)
      if (d < n.r + 6 / view.k && d < dist) (best = n), (dist = d)
    }
    return best
  }

  let drag: { x: number; y: number; moved: boolean } | undefined
  canvas.onpointerdown = (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false }
    canvas.setPointerCapture(e.pointerId)
  }
  canvas.onpointermove = (e) => {
    if (drag) {
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
      if (drag.moved) {
        autoFit = false
        view.x += dx
        view.y += dy
        drag.x = e.clientX
        drag.y = e.clientY
        draw()
      }
      return
    }
    const h = pick(e)
    if (h !== hover) {
      hover = h
      canvas.style.cursor = h ? "pointer" : "grab"
      canvas.title = h?.t ?? ""
      draw()
    }
  }
  canvas.onpointerup = (e) => {
    const wasDrag = drag?.moved
    drag = undefined
    if (wasDrag) return
    const n = pick(e)
    if (n && !samePath(n.u, location.pathname)) {
      canvas.closest("dialog")?.close()
      navigate(n.u)
    }
  }
  canvas.onpointerleave = () => {
    hover = undefined
    draw()
  }
  canvas.onwheel = (e) => {
    e.preventDefault()
    autoFit = false
    const before = toWorld(e)
    view.k = Math.min(4, Math.max(0.2, view.k * Math.exp(-e.deltaY * 0.0015)))
    const after = toWorld(e)
    view.x += (after.x - before.x) * view.k
    view.y += (after.y - before.y) * view.k
    draw()
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  const onTheme = () => ((colors = palette()), draw())
  document.addEventListener("themechange", onTheme)
  const stop = () => {
    sim.stop()
    ro.disconnect()
    document.removeEventListener("themechange", onTheme)
  }
  live.add(stop)
  return stop
}

let stopGlobal: (() => void) | undefined

/** (Re)draw the global graph with the filters currently chosen in its dialog. */
async function drawGlobal(dialog: HTMLDialogElement) {
  stopGlobal?.()
  const canvas = dialog.querySelector<HTMLCanvasElement>("canvas")!
  stopGlobal = await mountGraph(canvas, "global", readFilters(dialog))
}

export function openGraph() {
  const dialog = document.querySelector<HTMLDialogElement>("[data-graph-dialog]")
  if (!dialog || dialog.open) return
  dialog.showModal()
  if (!dialog.dataset.bound) {
    dialog.dataset.bound = "1"
    dialog.querySelectorAll("select[data-filter]").forEach((sel) => sel.addEventListener("change", () => drawGlobal(dialog)))
    dialog.addEventListener("close", () => {
      stopGlobal?.()
      stopGlobal = undefined
    })
  }
  void drawGlobal(dialog)
}
