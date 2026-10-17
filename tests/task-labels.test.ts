import { describe, expect, test } from "bun:test"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import { rehypeTaskLabels } from "../src/lib/task-labels"

const label = (html: string) => {
  const tree = fromHtml(html, { fragment: true })
  rehypeTaskLabels()(tree)
  return toHtml(tree)
}

describe("task checkbox labels", () => {
  test("a task's checkbox is named by its own words, not the tasks under it", () => {
    const out = label(
      '<ul><li class="task-list-item"><input type="checkbox" disabled> Write <strong>chapter</strong> one<ul><li class="task-list-item"><input type="checkbox" disabled> sub</li></ul></li></ul>',
    )
    expect(out).toContain('<input type="checkbox" disabled aria-label="Write chapter one">')
    expect(out).toContain('<input type="checkbox" disabled aria-label="sub">')
  })

  test("loose tasks keep their checkbox in a paragraph", () => {
    expect(label('<ul><li><p><input type="checkbox" checked disabled> Done it</p></li></ul>')).toContain('aria-label="Done it"')
  })

  test("the note a task query links to is left out", () => {
    const out = label('<ul><li><input type="checkbox" disabled> Ask <a href="/l">Luhmann</a> <a class="task-note internal" href="/q">Queries</a></li></ul>')
    expect(out).toContain('aria-label="Ask Luhmann"')
  })

  test("checkboxes already labelled, or not first in the item, stay as they are", () => {
    expect(label('<ul><li><label><input type="checkbox" id="x"> Salt</label></li></ul>')).not.toContain("aria-label")
    expect(label('<ul><li><input type="checkbox" aria-label="Own"> Text</li></ul>')).toContain('aria-label="Own"')
    expect(label('<ul><li>Text <input type="checkbox"></li></ul>')).not.toContain("aria-label")
  })
})
