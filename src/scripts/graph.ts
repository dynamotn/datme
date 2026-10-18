import type { Simulation, SimulationNodeDatum } from "d3-force"
import { applyForces, unpackPositions, type Forces, type LayoutRequest } from "./graph-sim"
import { navigate } from "astro:transitions/client"
import { loadGraph, samePath, matchesFilter, readFilters, type NoteFilter } from "./data"
import { groupColors } from "./graph-colors"
import { freshness } from "./outdated"
import { hasVisited, readFootprints } from "./footprints"
import { neighbourhood, parseDepth, type Depth } from "./graph-hops"
import { bounds, project, tilt, type Camera } from "./graph-3d"

interface GNode extends SimulationNodeDatum {
  i: number
  u: string
  t: string
  deg: number
  r: number
  /** Day the note was created, null when unknown. */
  k: number | null
  /** Group it is coloured by: its top folder, first type, stage, topic, freshness or visits. */
  g: string
  /** Links away from the current note, in the local graph. */
  hop: number
  z?: number
  vz?: number
  /** Where the note is drawn on the canvas, how much it is enlarged, and how near it is (0 far, 1 near). */
  sx: number
  sy: number
  ss: number
  near: number
}

interface GLink {
  source: GNode
  target: GNode
}

export interface GraphOptions {
  depth?: Depth
  /** Lay the graph out in space, turned by dragging, rather than flat. */
  space?: boolean
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

type Layout = { sim: Simulation<GNode, GLink>; d3: Forces }

/** The force layout on the page, fetched when a graph is first drawn: d3-force for a flat graph, its 3D sibling for space. */
async function layout(nodes: GNode[], space: boolean): Promise<Layout> {
  if (!space) {
    const d3 = await import("d3-force")
    return { sim: d3.forceSimulation<GNode, GLink>(nodes), d3 }
  }
  const d3 = await import("d3-force-3d")
  return { sim: d3.forceSimulation<GNode, GLink>(nodes, 3), d3 }
}

export async function mountGraph(canvas: HTMLCanvasElement, mode: "local" | "global", filter: NoteFilter = {}, opts: GraphOptions = {}) {
  const { depth = 1, space = false } = opts
  const lang = canvas.dataset.lang!
  const current = canvas.dataset.current ?? location.pathname
  const data = await loadGraph(lang)
  if (!canvas.isConnected) return

  const colorBy = canvas.dataset.colorBy
  const freshLabels = JSON.parse(canvas.dataset.freshLabels ?? "{}") as Record<string, string>
  // Footprints: notes the reader opened stand out, the rest stay in the fog.
  const footprints = colorBy === "visited" ? readFootprints() : undefined
  const groupOf = (n: (typeof data.notes)[number]) =>
    colorBy === "type"
      ? (n.y[0] ?? "")
      : colorBy === "folder"
        ? n.p
        : colorBy === "stage"
          ? (n.st ?? "")
          : colorBy === "topic"
            ? (n.tp ?? "")
          : colorBy === "fresh" && n.m != null
            ? (freshLabels[freshness(n.m)] ?? "")
            : footprints && hasVisited(footprints, n.u)
              ? (canvas.dataset.visitedLabel ?? "")
              : ""
  const all = data.notes.map(
    (n, i) =>
      ({
        i,
        u: n.u,
        t: n.t,
        deg: 0,
        r: 4,
        hop: 0,
        k: n.k ?? null,
        g: groupOf(n),
        sx: 0,
        sy: 0,
        ss: 1,
        near: 1,
      }) as GNode,
  )
  for (const [a, b] of data.links) (all[a].deg++, all[b].deg++)
  const cur = all.find((n) => samePath(n.u, current))

  let keep = new Set(all.filter((n) => matchesFilter(data.notes[n.i], filter)).map((n) => n.i))
  if (mode === "local") {
    const hops = cur ? neighbourhood(data.links, cur.i, depth) : new Map<number, number>()
    hops.forEach((hop, i) => (all[i].hop = hop))
    keep = new Set(hops.keys())
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

  // The layout runs in a worker, so a large graph never holds the page up; on the page only where workers are missing.
  const onPage = typeof Worker === "function" ? undefined : await layout(nodes, space)
  if (!canvas.isConnected) return void onPage?.sim.stop()

  const ctx = canvas.getContext("2d")!
  let colors = palette()
  const groups = groupColors(nodes.map((n) => n.g))
  // The time slider hides notes planted after the chosen day; undated notes always show.
  const shown = (n: GNode) => {
    const until = Number(canvas.dataset.until)
    return !canvas.dataset.until || n.k == null || n.k <= until
  }
  let width = 0
  let height = 0
  const view = { k: mode === "local" ? 1 : 0.8, x: 0, y: 0 }
  const cam: Camera = { yaw: 0.6, pitch: -0.35 }
  let hover: GNode | undefined
  // Keep the whole graph in view until the reader pans or zooms by hand.
  let autoFit = true
  // Wider horizontal padding leaves room for labels drawn around the outer nodes.
  const padX = mode === "local" ? 70 : 60
  const padY = mode === "local" ? 30 : 40
  const fit = () => {
    if (!autoFit || !nodes.length || !width) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of nodes) {
      x0 = Math.min(x0, n.x! - n.r)
      y0 = Math.min(y0, n.y! - n.r)
      x1 = Math.max(x1, n.x! + n.r)
      y1 = Math.max(y1, n.y! + n.r)
    }
    view.k = Math.min(1.6, (width - padX * 2) / Math.max(1, x1 - x0), (height - padY * 2) / Math.max(1, y1 - y0))
    view.x = -((x0 + x1) / 2) * view.k
    view.y = -((y0 + y1) / 2) * view.k
  }

  /** Place every note on the canvas: flat, or turned by the camera and seen in perspective. */
  const place = () => {
    if (!space) {
      fit()
      for (const n of nodes) {
        n.sx = width / 2 + view.x + n.x! * view.k
        n.sy = height / 2 + view.y + n.y! * view.k
        n.ss = view.k
      }
      return
    }
    const { centre, radius } = bounds(nodes.map((n) => ({ x: n.x!, y: n.y!, z: n.z ?? 0 })))
    const r = Math.max(radius, 1)
    // The eye stands three radii away: depth reads clearly without distorting the near side.
    const dist = r * 3
    if (autoFit && width) {
      view.k = Math.min(1.6, Math.min(width - padX * 2, height - padY * 2) / 2 / (r * 1.1))
      view.x = view.y = 0
    }
    for (const n of nodes) {
      const p = project({ x: n.x! - centre.x, y: n.y! - centre.y, z: (n.z ?? 0) - centre.z }, cam, dist)
      n.sx = width / 2 + view.x + p.x * view.k
      n.sy = height / 2 + view.y + p.y * view.k
      n.ss = p.s * view.k
      n.near = Math.max(0, Math.min(1, (p.z / r + 1) / 2))
    }
  }
  // In space, far notes fade and are drawn first, so near ones cover them.
  const depthCue = (n: GNode) => (space ? 0.3 + 0.7 * n.near : 1)

  const resize = () => {
    const dpr = window.devicePixelRatio || 1
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }

  // Nothing to draw until the layout has placed the notes.
  let placed = !!onPage
  function draw() {
    if (!placed) return
    place()
    ctx.clearRect(0, 0, width, height)
    const lit = hover ? (neighbours.get(hover) ?? new Set()) : undefined
    for (const l of links) {
      if (!shown(l.source) || !shown(l.target)) continue
      const on = hover && (l.source === hover || l.target === hover)
      ctx.strokeStyle = on ? colors.accent : colors.line
      const alpha = hover && !on ? 0.25 : on ? 0.9 : l.source.hop > 1 || l.target.hop > 1 ? 0.35 : 0.6
      ctx.globalAlpha = on ? alpha : alpha * Math.min(depthCue(l.source), depthCue(l.target))
      ctx.lineWidth = on ? 1.6 : 1
      ctx.beginPath()
      ctx.moveTo(l.source.sx, l.source.sy)
      ctx.lineTo(l.target.sx, l.target.sy)
      ctx.stroke()
    }
    const order = space ? [...nodes].sort((a, b) => a.near - b.near) : nodes
    for (const n of order) {
      if (!shown(n)) continue
      const isCur = n === cur
      const on = n === hover || lit?.has(n)
      // Notes two links away stay fainter, so the note's own links stand out.
      const alpha = hover && !on && n !== hover ? 0.3 : !hover && n.hop > 1 ? 0.55 : 1
      ctx.globalAlpha = on ? alpha : alpha * depthCue(n)
      ctx.fillStyle = isCur ? colors.current : on ? colors.accent : (groups.get(n.g) ?? colors.node)
      ctx.beginPath()
      ctx.arc(n.sx, n.sy, n.r * n.ss, 0, Math.PI * 2)
      ctx.fill()
      if (isCur) {
        ctx.strokeStyle = colors.current
        ctx.globalAlpha = 0.3
        ctx.lineWidth = 4
        ctx.stroke()
      }
    }
    // Labels: current, hovered and its neighbours, or everything once zoomed in.
    ctx.globalAlpha = 1
    ctx.font = "12px Inter Variable, sans-serif"
    ctx.textAlign = "center"
    for (const n of order) {
      if (!shown(n)) continue
      const show = n === cur || n === hover || lit?.has(n) || view.k > 1.6 || nodes.length < (mode === "local" ? 14 : 30)
      if (!show) continue
      const on = n === hover || lit?.has(n)
      const alpha = hover && !on ? 0.3 : 0.95
      ctx.globalAlpha = on ? alpha : alpha * depthCue(n)
      const label = n.t.length > 32 ? n.t.slice(0, 30) + "…" : n.t
      const y = n.sy - n.r * n.ss - 5
      ctx.lineWidth = 3
      ctx.strokeStyle = colors.bg
      ctx.strokeText(label, n.sx, y)
      ctx.fillStyle = colors.ink
      ctx.fillText(label, n.sx, y)
    }
  }

  // A tick draws at most once a frame; while the graph spins, the spin draws it already.
  let pending = 0
  const onTick = () => {
    if (spinning || pending) return
    pending = requestAnimationFrame(() => {
      pending = 0
      draw()
    })
  }
  let stopped = false
  let stopLayout: () => void
  const runOnPage = ({ sim, d3 }: Layout) => {
    if (stopped) return void sim.stop()
    placed = true
    applyForces(sim, d3, links, mode).on("tick", onTick)
    stopLayout = () => sim.stop()
  }
  if (onPage) runOnPage(onPage)
  else {
    const worker = new Worker(new URL("./graph-worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<Float32Array>) => {
      unpackPositions(nodes, e.data, space ? 3 : 2)
      placed = true
      onTick()
    }
    // A worker that cannot start, e.g. a browser without module workers: lay out on the page after all.
    worker.onerror = () => {
      worker.terminate()
      void layout(nodes, space).then(runOnPage)
    }
    const at = new Map(nodes.map((n, i) => [n, i]))
    worker.postMessage({
      r: nodes.map((n) => n.r),
      links: links.map((l) => [at.get(l.source)!, at.get(l.target)!]),
      mode,
      space,
    } satisfies LayoutRequest)
    stopLayout = () => worker.terminate()
  }

  // In space the graph turns slowly by itself until the reader takes over, unless they want less motion.
  let spinning = space && !matchMedia("(prefers-reduced-motion: reduce)").matches
  let frame = 0
  const spin = () => {
    if (!hover) cam.yaw += 0.003
    draw()
    frame = requestAnimationFrame(spin)
  }
  const still = () => {
    spinning = false
    cancelAnimationFrame(frame)
  }
  if (spinning) frame = requestAnimationFrame(spin)

  const at = (e: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const pick = (e: PointerEvent) => {
    const p = at(e)
    let best: GNode | undefined
    let dist = Infinity
    for (const n of nodes) {
      if (!shown(n)) continue
      const d = Math.hypot(n.sx - p.x, n.sy - p.y)
      // Where notes overlap in space, the nearer one wins.
      const score = d - n.near * 4
      if (d < n.r * n.ss + 6 && score < dist) (best = n), (dist = score)
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
        // A flat graph pans; one in space turns.
        if (space) {
          if (spinning) still()
          cam.yaw += dx * 0.008
          cam.pitch = tilt(cam.pitch, -dy * 0.008)
        } else {
          autoFit = false
          view.x += dx
          view.y += dy
        }
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
  /** Zoom by a factor around a point of the canvas: what lies under it stays there. */
  const zoom = (factor: number, p: { x: number; y: number }) => {
    autoFit = false
    const k = Math.min(4, Math.max(0.2, view.k * factor))
    view.x = p.x - width / 2 - ((p.x - width / 2 - view.x) * k) / view.k
    view.y = p.y - height / 2 - ((p.y - height / 2 - view.y) * k) / view.k
    view.k = k
    draw()
  }
  canvas.onwheel = (e) => {
    e.preventDefault()
    zoom(Math.exp(-e.deltaY * 0.0015), at(e))
  }
  // The + and − buttons next to the canvas (src/scripts/app.ts) zoom around its middle.
  const onZoom = (e: Event) => zoom((e as CustomEvent<number>).detail > 0 ? 1.4 : 1 / 1.4, { x: width / 2, y: height / 2 })
  canvas.addEventListener("graphzoom", onZoom)

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  canvas.addEventListener("redraw", draw)
  legend(canvas, groups)
  const onTheme = () => ((colors = palette()), draw())
  document.addEventListener("themechange", onTheme)
  const stop = () => {
    stopped = true
    stopLayout()
    still()
    if (pending) cancelAnimationFrame(pending)
    pending = 0
    ro.disconnect()
    canvas.removeEventListener("redraw", draw)
    canvas.removeEventListener("graphzoom", onZoom)
    document.removeEventListener("themechange", onTheme)
    live.delete(stop)
  }
  live.add(stop)
  return stop
}

const DEPTH_KEY = "graphDepth"
const SPACE_KEY = "graphView"

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // storage blocked: use the site's default
    return null
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // private mode: the choice lasts for this page only
  }
}

/** The local graph of a note, as many links deep as the reader last chose, or as the site sets. */
export function mountLocalGraph(canvas: HTMLCanvasElement) {
  const buttons = canvas.closest(".graph-box")?.querySelectorAll<HTMLButtonElement>("[data-graph-depth]") ?? []
  let stop: (() => void) | undefined
  let latest = 0
  const show = async (depth: Depth) => {
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.graphDepth === String(depth))))
    stop?.()
    const mine = ++latest
    const next = await mountGraph(canvas, "local", {}, { depth })
    // A quicker second click may have mounted another graph meanwhile.
    if (mine === latest) stop = next
    else next?.()
  }
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      const depth = parseDepth(b.dataset.graphDepth, 1)
      remember(DEPTH_KEY, String(depth))
      void show(depth)
    }),
  )
  // Fetch the graph index and lay it out only once the graph comes into view: never while its rail is hidden.
  const watch = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      unwatch()
      void show(parseDepth(recall(DEPTH_KEY), parseDepth(canvas.dataset.depth, 1)))
    },
    { rootMargin: "200px" },
  )
  const unwatch = () => (watch.disconnect(), live.delete(unwatch))
  live.add(unwatch)
  watch.observe(canvas)
}

/** The colours of the groups, under the global graph. */
function legend(canvas: HTMLCanvasElement, groups: Map<string, string>) {
  const box = canvas.closest("dialog")?.querySelector<HTMLElement>("[data-graph-legend]")
  if (!box) return
  box.replaceChildren(
    ...[...groups].map(([g, color]) => {
      const item = document.createElement("span")
      const dot = document.createElement("i")
      dot.style.background = color
      item.append(dot, g)
      return item
    }),
  )
}

let stopGlobal: (() => void) | undefined
let globalDraws = 0

/** (Re)draw the global graph with the filters and view currently chosen in its dialog. */
async function drawGlobal(dialog: HTMLDialogElement) {
  stopGlobal?.()
  stopGlobal = undefined
  const mine = ++globalDraws
  const canvas = dialog.querySelector<HTMLCanvasElement>("canvas")!
  const color = dialog.querySelector<HTMLSelectElement>("[data-graph-color]")
  canvas.dataset.colorBy = color?.value ?? ""
  canvas.dataset.freshLabels = color?.dataset.freshLabels ?? "{}"
  canvas.dataset.visitedLabel = color?.dataset.visitedLabel ?? ""
  const space = (recall(SPACE_KEY) ?? dialog.dataset.view) === "3d"
  dialog.querySelector("[data-graph-3d]")?.setAttribute("aria-pressed", String(space))
  const stop = await mountGraph(canvas, "global", readFilters(dialog), { space })
  // Filters changed or the dialog closed while the graph was loading.
  if (mine !== globalDraws || !dialog.open) return void stop?.()
  stopGlobal = stop
  await setupTime(dialog, canvas)
}

/** The time slider spans the days notes were planted; at its right end every note shows. */
async function setupTime(dialog: HTMLDialogElement, canvas: HTMLCanvasElement) {
  const range = dialog.querySelector<HTMLInputElement>("[data-graph-time]")
  const out = dialog.querySelector<HTMLOutputElement>("[data-graph-time-label]")
  if (!range || !out) return
  const days = (await loadGraph(canvas.dataset.lang!)).notes.map((n) => n.k).filter((k): k is number => k != null)
  if (!days.length) return void (range.hidden = true)
  range.min = String(Math.min(...days))
  range.max = String(Math.max(...days))
  if (!range.dataset.bound) {
    range.dataset.bound = "1"
    range.value = range.max
    range.addEventListener("input", () => {
      const atEnd = range.value === range.max
      canvas.dataset.until = atEnd ? "" : range.value
      out.textContent = atEnd ? "" : new Date(Number(range.value) * 86_400_000).toLocaleDateString(document.documentElement.lang || undefined)
      canvas.dispatchEvent(new Event("redraw"))
    })
  }
}

export function openGraph() {
  const dialog = document.querySelector<HTMLDialogElement>("[data-graph-dialog]")
  if (!dialog || dialog.open) return
  dialog.showModal()
  if (!dialog.dataset.bound) {
    dialog.dataset.bound = "1"
    dialog.querySelectorAll("select[data-filter], select[data-graph-color]").forEach((sel) => sel.addEventListener("change", () => drawGlobal(dialog)))
    dialog.querySelector("[data-graph-3d]")?.addEventListener("click", (e) => {
      const on = (e.currentTarget as HTMLElement).getAttribute("aria-pressed") === "true"
      remember(SPACE_KEY, on ? "2d" : "3d")
      void drawGlobal(dialog)
    })
    dialog.addEventListener("close", () => {
      stopGlobal?.()
      stopGlobal = undefined
    })
  }
  void drawGlobal(dialog)
}
