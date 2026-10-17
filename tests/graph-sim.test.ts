import { afterAll, describe, expect, test } from "bun:test"
import * as d3 from "d3-force"
import * as d3x from "d3-force-3d"
import { applyForces, packPositions, paced, runLayout, serveLayout, unpackPositions, type LayoutLib, type LayoutRequest, type LayoutScope, type SimNode } from "../src/scripts/graph-sim"
import { LARGE_GRAPH } from "../src/scripts/graph-settle"

const RADII = [5, 4, 4, 3, 3, 3]
const LINKS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [4, 5],
]
const nodesOf = (r = RADII): SimNode[] => r.map((r) => ({ r }))
const linksOf = (pairs = LINKS) => pairs.map(([source, target]) => ({ source, target }))

/** Runs a layout with every wait taken at once, as a worker would over many frames. */
function runAll(sim: ReturnType<typeof d3.forceSimulation<SimNode>>, dims: 2 | 3) {
  const posted: Float32Array[] = []
  const queue: (() => void)[] = []
  runLayout(sim, dims, (p) => posted.push(p), (next) => void queue.push(next))
  while (queue.length) queue.shift()!()
  return posted
}

describe("the graph's layout", () => {
  test("runs tick by tick to the same rest as d3's own timer, handing positions after each", () => {
    const posted = runAll(applyForces(d3.forceSimulation(nodesOf()), d3, linksOf(), "local"), 2)
    // The same layout ticked by hand: d3's timer ticks the same way, once a frame.
    const ref = applyForces(d3.forceSimulation(nodesOf()), d3, linksOf(), "local")
    ref.stop()
    let ticks = 0
    while (ref.alpha() >= ref.alphaMin()) (ref.tick(), ticks++)
    expect(posted).toHaveLength(ticks)
    expect([...posted.at(-1)!]).toEqual([...packPositions(ref.nodes(), 2)])
    // Notes linked together end nearer than notes far apart.
    const at = (i: number) => [posted.at(-1)![i * 2], posted.at(-1)![i * 2 + 1]]
    const dist = (a: number, b: number) => Math.hypot(at(a)[0] - at(b)[0], at(a)[1] - at(b)[1])
    expect(dist(0, 1)).toBeLessThan(dist(3, 5))
  })

  test("the forces depend on the graph: local spreads wider; collisions only below a large graph", () => {
    const local = applyForces(d3.forceSimulation(nodesOf()), d3, linksOf(), "local")
    const global = applyForces(d3.forceSimulation(nodesOf()), d3, linksOf(), "global")
    for (const sim of [local, global]) sim.stop()
    expect((local.force("link") as d3.ForceLink<SimNode, d3.SimulationLinkDatum<SimNode>>).distance()({} as never, 0, [])).toBe(46)
    expect((global.force("link") as d3.ForceLink<SimNode, d3.SimulationLinkDatum<SimNode>>).distance()({} as never, 0, [])).toBe(36)
    expect(local.force("collide")).toBeDefined()
    const large = applyForces(d3.forceSimulation(nodesOf(Array(LARGE_GRAPH + 1).fill(3))), d3, [], "global")
    large.stop()
    expect(large.force("collide")).toBeUndefined()
  })

  test("stops when asked, between two ticks", () => {
    const sim = applyForces(d3.forceSimulation(nodesOf()), d3, linksOf(), "global")
    const posted: Float32Array[] = []
    const queue: (() => void)[] = []
    const stop = runLayout(sim, 2, (p) => posted.push(p), (next) => void queue.push(next))
    queue.shift()!()
    queue.shift()!()
    stop()
    while (queue.length) queue.shift()!()
    expect(posted).toHaveLength(2)
  })

  test("positions pack flat or in space, and unpack onto the notes", () => {
    const nodes: SimNode[] = [
      { r: 1, x: 1, y: 2, z: 3 },
      { r: 1, x: 4, y: 5, z: 6 },
    ]
    expect([...packPositions(nodes, 2)]).toEqual([1, 2, 4, 5])
    expect([...packPositions(nodes, 3)]).toEqual([1, 2, 3, 4, 5, 6])
    const back = nodesOf([1, 1])
    unpackPositions(back, new Float32Array([1, 2, 4, 5]), 2)
    expect(back.map((n) => [n.x, n.y, n.z])).toEqual([
      [1, 2, undefined],
      [4, 5, undefined],
    ])
    unpackPositions(back, new Float32Array([1, 2, 3, 4, 5, 6]), 3)
    expect(back.map((n) => n.z)).toEqual([3, 6])
  })

  test("paced ticks come a frame apart, never all at once", async () => {
    const delays: number[] = []
    const real = globalThis.setTimeout
    globalThis.setTimeout = ((fn: () => void, ms: number) => (delays.push(ms), real(fn, 0))) as typeof setTimeout
    try {
      // Three ticks asked for at once are spread a frame apart.
      const wait = paced(20)
      for (let i = 0; i < 3; i++) wait(() => {})
    } finally {
      globalThis.setTimeout = real
    }
    expect(delays[0]).toBe(0)
    expect(delays[1]).toBeGreaterThan(18)
    expect(delays[2]).toBeGreaterThan(38)
    // The default is one frame of a 60 Hz screen.
    const once = paced()
    await new Promise<void>((done) => once(done))
  })
})

describe("the layout worker", () => {
  /** A worker's scope: what it posts, and the transfers that hand over the buffers. */
  const scope = () => {
    const posted: { p: Float32Array; transfer: Transferable[] }[] = []
    const s: LayoutScope = { onmessage: null, postMessage: (p, transfer) => void posted.push({ p, transfer }) }
    return { s, posted }
  }
  const send = async (s: LayoutScope, data: LayoutRequest) => await s.onmessage!({ data } as MessageEvent<LayoutRequest>)
  const libs = (space: boolean) => Promise.resolve((space ? d3x : d3) as unknown as LayoutLib)

  test("lays out each request and posts its positions, handing the buffers over", async () => {
    const { s, posted } = scope()
    const queue: (() => void)[] = []
    serveLayout(s, libs, (next) => void queue.push(next))
    await send(s, { r: RADII, links: LINKS, mode: "local", space: false })
    while (queue.length) queue.shift()!()
    const ref = runAll(applyForces(d3.forceSimulation(nodesOf()), d3, linksOf(), "local"), 2)
    expect(posted.map((x) => [...x.p])).toEqual(ref.map((p) => [...p]))
    expect(posted[0].transfer).toEqual([posted[0].p.buffer])
  })

  test("in space it uses the 3D layout, and a new request replaces the one running", async () => {
    const { s, posted } = scope()
    const queue: (() => void)[] = []
    serveLayout(s, libs, (next) => void queue.push(next))
    await send(s, { r: RADII, links: LINKS, mode: "global", space: false })
    queue.shift()!()
    await send(s, { r: RADII, links: LINKS, mode: "global", space: true })
    while (queue.length) queue.shift()!()
    expect(posted[0].p).toHaveLength(RADII.length * 2)
    expect(posted.slice(1).every((x) => x.p.length === RADII.length * 3)).toBe(true)
  })

  test("by default ticks are paced a frame apart", async () => {
    const { s, posted } = scope()
    serveLayout(s, libs)
    await send(s, { r: [3, 3], links: [[0, 1]], mode: "local", space: false })
    await new Promise((r) => setTimeout(r, 60))
    expect(posted.length).toBeGreaterThan(0)
    // A further request stops this one.
    await send(s, { r: [], links: [], mode: "local", space: false })
  })
})

describe("the worker script", () => {
  const g = globalThis as unknown as Record<string, unknown>
  const saved = { self: Object.getOwnPropertyDescriptor(globalThis, "self") }
  afterAll(() => {
    if (saved.self) Object.defineProperty(globalThis, "self", saved.self)
  })

  const msg = (data: LayoutRequest) => ({ data }) as MessageEvent<LayoutRequest>
  test("serves layouts from its own scope, loading the flat or 3D layout", async () => {
    const posted: Float32Array[] = []
    const fake: LayoutScope = { onmessage: null, postMessage: (p) => void posted.push(p) }
    Object.defineProperty(globalThis, "self", { configurable: true, value: fake })
    await import("../src/scripts/graph-worker")
    expect(typeof fake.onmessage).toBe("function")
    await fake.onmessage!(msg({ r: [3, 3], links: [[0, 1]], mode: "local", space: false }))
    await fake.onmessage!(msg({ r: [3, 3], links: [[0, 1]], mode: "local", space: true }))
    await new Promise((r) => setTimeout(r, 60))
    expect(posted.some((p) => p.length === 6)).toBe(true)
    // Stop the running layout.
    await fake.onmessage!(msg({ r: [], links: [], mode: "local", space: false }))
    expect(g.self).toBe(fake)
  })
})
