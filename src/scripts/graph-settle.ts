import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from "d3-force"

/** Above this many notes the layout trades some polish for a page that stays responsive. */
export const LARGE_GRAPH = 500

/**
 * Collisions keep notes apart in a graph of ordinary size. A large graph
 * settles in fewer ticks and lets notes overlap instead, as collisions cost
 * the most: each tick of a few thousand notes would otherwise hold the page up.
 */
export function settle<N extends SimulationNodeDatum & { r: number }, L extends SimulationLinkDatum<N>>(
  sim: Simulation<N, L>,
  d3: Pick<typeof import("d3-force"), "forceCollide">,
) {
  if (sim.nodes().length > LARGE_GRAPH) sim.alphaDecay(0.06)
  else
    sim.force(
      "collide",
      d3.forceCollide<N>((n) => n.r + 3),
    )
}
