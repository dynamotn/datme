import { describe, expect, test } from "bun:test"
import * as d3 from "d3-force"
import { LARGE_GRAPH, settle } from "../src/scripts/graph-settle"

type N = d3.SimulationNodeDatum & { r: number }
const sim = (n: number) => d3.forceSimulation<N, d3.SimulationLinkDatum<N>>(Array.from({ length: n }, (): N => ({ r: 4 }))).stop()

describe("settling the graph layout", () => {
  test("a graph of ordinary size keeps notes apart and settles at d3's pace", () => {
    const s = sim(LARGE_GRAPH)
    const decay = s.alphaDecay()
    settle(s, d3)
    expect(s.force("collide")).toBeDefined()
    expect(s.alphaDecay()).toBe(decay)
  })

  test("a large graph skips collisions and settles in fewer ticks", () => {
    const s = sim(LARGE_GRAPH + 1)
    const decay = s.alphaDecay()
    settle(s, d3)
    expect(s.force("collide")).toBeUndefined()
    expect(s.alphaDecay()).toBeGreaterThan(decay)
  })
})
