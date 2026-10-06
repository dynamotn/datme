import { describe, expect, test } from "bun:test"
import { isKanban, kanban } from "../src/lib/kanban"
import { renderMarkdown } from "../src/lib/markdown"

const board = `## To do

- [ ] Write **chapter** one
- [ ] Ask [[Luhmann]]

## Done

**Complete**
- [x] Outline

%% kanban:settings
\`\`\`
{"kanban-plugin":"basic"}
\`\`\`
%%
`

describe("kanban", () => {
  test("the plugin's frontmatter marks a board", () => {
    expect(isKanban({ "kanban-plugin": "basic" })).toBe(true)
    expect(isKanban({})).toBe(false)
  })

  test("headings become lanes, list items cards; settings and Complete markers go", async () => {
    const md = kanban(board)
    expect(md).not.toContain("kanban:settings")
    expect(md).not.toContain("**Complete**")
    const html = await renderMarkdown(md, "en-US", "x")
    expect(html).toMatch(/<div class="kanban">\s*<section class="kanban-lane">\s*<h2 id="to-do">To do/)
    expect(html).toMatch(/<li class="task-list-item"><input type="checkbox" disabled> Write <strong>chapter<\/strong> one<\/li>/)
    expect(html.match(/class="kanban-lane"/g)).toHaveLength(2)
    expect(html).toMatch(/<input type="checkbox" checked disabled> Outline/)
  })

  test("a note without headings stays as it is", () => {
    expect(kanban("- [ ] lone card")).toBe("- [ ] lone card")
  })
})
