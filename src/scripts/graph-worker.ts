/** The graph's layout, in a worker of its own: the page only draws the positions it posts. */
import { serveLayout, type LayoutLib, type LayoutScope } from "./graph-sim"

serveLayout(self as unknown as LayoutScope, async (space) => (space ? await import("d3-force-3d") : await import("d3-force")) as unknown as LayoutLib)
