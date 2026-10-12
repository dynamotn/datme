// d3-force-3d ships no types; it is d3-force with a third dimension, so borrow those.
declare module "d3-force-3d" {
  import type { ForceCenter, ForceCollide, ForceLink, ForceManyBody, Simulation, SimulationLinkDatum, SimulationNodeDatum } from "d3-force"

  export function forceSimulation<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N> | undefined = undefined>(
    nodes?: N[],
    numDimensions?: 1 | 2 | 3,
  ): Simulation<N, L>
  export function forceLink<N extends SimulationNodeDatum, L extends SimulationLinkDatum<N>>(links?: L[]): ForceLink<N, L>
  export function forceManyBody<N extends SimulationNodeDatum>(): ForceManyBody<N>
  export function forceCenter<N extends SimulationNodeDatum>(x?: number, y?: number, z?: number): ForceCenter<N>
  export function forceCollide<N extends SimulationNodeDatum>(radius?: number | ((node: N, i: number, nodes: N[]) => number)): ForceCollide<N>
}
