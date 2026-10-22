/**
 * Boards of the Obsidian Kanban plugin: a note with `kanban-plugin` in its
 * frontmatter, whose `## headings` are lanes and whose list items are cards.
 * The board becomes lanes side by side; each card keeps its markdown.
 */

import { escapeAttrKeepGt } from "./html"

export function isKanban(fm: Record<string, unknown>): boolean {
  return fm["kanban-plugin"] != null
}

/** `label` names the board, a scrolling region the keyboard can reach. */
export function kanban(md: string, label = "Board"): string {
  // The plugin keeps its settings in a %% kanban:settings %% block and marks done lanes with **Complete**.
  const body = md
    .replace(/%%\s*kanban:settings[\s\S]*?%%/g, "")
    .split("\n")
    .filter((l) => l.trim() !== "**Complete**")
  const lanes: { title: string; lines: string[] }[] = []
  const before: string[] = []
  for (const line of body) {
    const h = line.match(/^##\s+(.*?)\s*#*$/)
    if (h) lanes.push({ title: h[1], lines: [] })
    else if (lanes.length) lanes.at(-1)!.lines.push(line)
    else before.push(line)
  }
  if (!lanes.length) return md
  // Blank lines around the HTML keep the headings and lists inside it markdown.
  const html = lanes.map((lane) => `<section class="kanban-lane">\n\n## ${lane.title}\n\n${lane.lines.join("\n").trim()}\n\n</section>`).join("\n\n")
  const name = escapeAttrKeepGt(label)
  return `${before.join("\n").trim()}\n\n<div class="kanban" tabindex="0" role="region" aria-label="${name}">\n\n${html}\n\n</div>\n`
}
