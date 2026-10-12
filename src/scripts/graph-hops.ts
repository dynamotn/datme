/** How many links the local graph follows out of the current note. */
export type Depth = 1 | 2

export const DEPTHS: Depth[] = [1, 2]

/** A depth read from a data attribute or the reader's storage; anything else falls back. */
export function parseDepth(raw: string | null | undefined, fallback: Depth): Depth {
  const n = Number(raw)
  return DEPTHS.includes(n as Depth) ? (n as Depth) : fallback
}

/** Notes at most `depth` links away from `start`, each with how many links away it is. */
export function neighbourhood(links: [number, number][], start: number, depth: number): Map<number, number> {
  const hops = new Map([[start, 0]])
  let frontier = new Set([start])
  for (let d = 1; d <= depth && frontier.size; d++) {
    const next = new Set<number>()
    for (const [a, b] of links) {
      if (frontier.has(a) && !hops.has(b)) (hops.set(b, d), next.add(b))
      if (frontier.has(b) && !hops.has(a)) (hops.set(a, d), next.add(a))
    }
    frontier = next
  }
  return hops
}
