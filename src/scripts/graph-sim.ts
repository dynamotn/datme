/**
 * The graph's force layout, apart from drawing it: the forces, and a loop
 * that runs them to rest one tick per frame, handing over positions as it
 * goes. A worker runs it so a large graph never holds the page up; the page
 * runs the same forces itself where workers are unavailable.
 */
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from "d3-force"
import { settle } from "./graph-settle"

export interface SimNode extends SimulationNodeDatum {
  r: number
  z?: number
}

export type Forces = Pick<typeof import("d3-force"), "forceLink" | "forceManyBody" | "forceCenter" | "forceCollide">

/** d3-force, or its 3D sibling, which takes the number of dimensions. */
export interface LayoutLib extends Forces {
  forceSimulation<N extends SimNode>(nodes: N[], dims?: number): Simulation<N, undefined>
}

export type Mode = "local" | "global"

/** What the page asks a worker to lay out: each note's radius, links as pairs of their indices. */
export interface LayoutRequest {
  r: number[]
  links: [number, number][]
  mode: Mode
  space: boolean
}

/** Links pull notes together, notes push each other apart, and the whole stays centred. */
export function applyForces<N extends SimNode, L extends SimulationLinkDatum<N>>(sim: Simulation<N, L>, d3: Forces, links: L[], mode: Mode) {
  sim
    .force("link", d3.forceLink<N, L>(links).distance(mode === "local" ? 46 : 36))
    .force("charge", d3.forceManyBody<N>().strength(mode === "local" ? -120 : -70))
    .force("center", d3.forceCenter<N>(0, 0))
  settle(sim, d3)
  return sim
}

/** Positions of the notes, x and y (and z in space) one after another. */
export function packPositions(nodes: SimNode[], dims: 2 | 3): Float32Array {
  const out = new Float32Array(nodes.length * dims)
  nodes.forEach((n, i) => {
    out[i * dims] = n.x!
    out[i * dims + 1] = n.y!
    if (dims === 3) out[i * dims + 2] = n.z!
  })
  return out
}

/** Puts packed positions back on the notes. */
export function unpackPositions(nodes: SimNode[], data: Float32Array, dims: 2 | 3): void {
  nodes.forEach((n, i) => {
    n.x = data[i * dims]
    n.y = data[i * dims + 1]
    if (dims === 3) n.z = data[i * dims + 2]
  })
}

/**
 * Ticks the layout until it comes to rest, as d3's own timer would, handing
 * positions after each tick; `wait` decides when the next tick comes. Returns a stop.
 */
export function runLayout<N extends SimNode>(
  sim: Simulation<N, undefined>,
  dims: 2 | 3,
  post: (positions: Float32Array) => void,
  wait: (next: () => void) => void,
): () => void {
  let stopped = false
  sim.stop()
  const step = () => {
    if (stopped) return
    sim.tick()
    post(packPositions(sim.nodes(), dims))
    if (sim.alpha() >= sim.alphaMin()) wait(step)
  }
  wait(step)
  return () => {
    stopped = true
  }
}

/** One tick a frame, like the page's animation frames: the layout unfolds as it always did. */
export function paced(frame = 16): (next: () => void) => void {
  // The first tick comes at once, even right as a worker starts its clock.
  let due = -Infinity
  return (next) => {
    const now = performance.now()
    due = Math.max(now, due + frame)
    setTimeout(next, due - now)
  }
}

/** What a worker sees of its scope. */
export interface LayoutScope {
  onmessage: ((e: MessageEvent<LayoutRequest>) => void | Promise<void>) | null
  postMessage(positions: Float32Array, transfer: Transferable[]): void
}

/** Lays out each request the worker receives, posting positions after every tick. */
export function serveLayout(scope: LayoutScope, load: (space: boolean) => Promise<LayoutLib>, wait: (next: () => void) => void = paced()): void {
  let stop = () => {}
  scope.onmessage = async ({ data }) => {
    stop()
    const d3 = await load(data.space)
    const dims = data.space ? 3 : 2
    const nodes: SimNode[] = data.r.map((r) => ({ r }))
    const sim = d3.forceSimulation(nodes, dims)
    applyForces(
      sim,
      d3,
      data.links.map(([source, target]) => ({ source, target })),
      data.mode,
    )
    stop = runLayout(sim, dims, (p) => scope.postMessage(p, [p.buffer]), wait)
  }
}
