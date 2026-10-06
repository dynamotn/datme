/** Colours of the groups of the graph, readable on both themes. */
export const GROUP_COLORS = ["#2563eb", "#d97706", "#059669", "#db2777", "#7c3aed", "#dc2626", "#0891b2", "#65a30d"]

/** A stable colour for each group, in the order the groups are sorted. */
export function groupColors(groups: string[]): Map<string, string> {
  const sorted = [...new Set(groups.filter(Boolean))].sort((a, b) => a.localeCompare(b))
  return new Map(sorted.map((g, i) => [g, GROUP_COLORS[i % GROUP_COLORS.length]]))
}
