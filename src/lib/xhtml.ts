import { find, html } from "property-information"
import type { Root, RootContent, Element, Properties } from "hast"

/** Inline SVG and MathML only render in XHTML when they say which language they speak. */
const NAMESPACES: Record<string, string> = { svg: "http://www.w3.org/2000/svg", math: "http://www.w3.org/1998/Math/MathML" }

/** Elements that never have content, written as <br/> in XML. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;")

function attributes(props: Properties): string {
  let out = ""
  for (const [prop, value] of Object.entries(props)) {
    if (value == null || value === false) continue
    const info = find(html, prop)
    let text: string
    if (value === true) text = info.attribute
    else if (Array.isArray(value)) text = value.join(info.commaSeparated ? ", " : " ")
    else text = String(value)
    out += ` ${info.attribute}="${escapeAttr(text)}"`
  }
  return out
}

/**
 * Well-formed XHTML for EPUB: every element closed, boolean attributes
 * spelled out, only XML's own entities. Comments, doctypes and raw HTML are dropped.
 */
export function toXhtml(node: Root | RootContent): string {
  switch (node.type) {
    case "root":
      return node.children.map(toXhtml).join("")
    case "text":
      return escapeText(node.value)
    case "element": {
      const el = node as Element
      const children = (el.tagName === "template" ? [] : el.children).map(toXhtml).join("")
      const ns = NAMESPACES[el.tagName] && !("xmlns" in el.properties) ? ` xmlns="${NAMESPACES[el.tagName]}"` : ""
      const attrs = ns + attributes(el.properties)
      if (VOID.has(el.tagName) && !children) return `<${el.tagName}${attrs}/>`
      return `<${el.tagName}${attrs}>${children}</${el.tagName}>`
    }
    default:
      return ""
  }
}
