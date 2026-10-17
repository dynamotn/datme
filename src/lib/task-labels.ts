import type { Element, ElementContent, Root } from "hast"
import { toString as hastToString } from "hast-util-to-string"
import { visit } from "unist-util-visit"

const isElement = (n: ElementContent | undefined, tag: string): n is Element => n?.type === "element" && n.tagName === tag

/** The words of a task, without its checkbox or the tasks nested under it. */
function taskText(li: Element): string {
  const own = (nodes: ElementContent[]): string =>
    nodes
      .map((n) => {
        if (n.type === "text") return n.value
        if (n.type !== "element" || ["ul", "ol", "input"].includes(n.tagName)) return ""
        // A task query names the note each task comes from; that is not the task.
        if (String(n.properties.className ?? "").includes("task-note")) return ""
        return n.tagName === "p" ? own(n.children) : hastToString(n)
      })
      .join("")
  return own(li.children).replace(/\s+/g, " ").trim()
}

/**
 * A task's checkbox is named by the task's own words, so screen readers say
 * what is done or not; a checkbox already labelled is left alone.
 */
export const rehypeTaskLabels = () => (tree: Root) => {
  visit(tree, "element", (li: Element) => {
    if (li.tagName !== "li") return
    const lead = (nodes: ElementContent[]) => nodes.find((c) => c.type === "element" || (c.type === "text" && c.value.trim()))
    const first = lead(li.children)
    const box = isElement(first, "p") ? lead(first.children) : first
    if (!isElement(box, "input") || box.properties.type !== "checkbox") return
    if (box.properties.ariaLabel || box.properties.ariaLabelledBy || box.properties.id) return
    const text = taskText(li)
    if (text) box.properties.ariaLabel = text
  })
}
