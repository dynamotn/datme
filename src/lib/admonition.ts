import { unified, type Plugin } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { visit, SKIP } from "unist-util-visit"
import type { Root as MdRoot, Blockquote, Code } from "mdast"

/** Types the Admonition plugin ships; any other type renders as a note. */
const TYPES = new Set(
  "note seealso abstract summary tldr info todo tip hint important success check done question help faq warning caution attention failure fail missing danger error bug example quote cite".split(
    " ",
  ),
)
const FOLD: Record<string, string> = { open: "+", closed: "-" }
const OPTION = /^(title|collapse|icon|color):[^\S\n]*(.*)$/

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

/** "#rgb", "#rrggbb" or "r, g, b" as the space-separated triplet callouts keep in --c; anything else is dropped. */
export function colorTriplet(value: string): string | undefined {
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex
    return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)).join(" ")
  }
  const rgb = value.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/)
  return rgb?.slice(1).every((n) => Number(n) < 256) ? rgb.slice(1).join(" ") : undefined
}

/**
 * Admonition plugin blocks (```ad-warning with title:, collapse:, color: lines)
 * become the blockquote callout `> [!warning]- Title`, which remarkCallouts renders.
 * shortcut: `icon:` is read and ignored, callouts have no custom icons.
 */
export const remarkAdmonitions: Plugin<[], MdRoot> = () => {
  const convert = (tree: MdRoot) =>
    visit(tree, "code", (node: Code, index, parent) => {
      const type = node.lang?.match(/^ad-([\w-]+)$/i)?.[1].toLowerCase()
      if (!type || !parent || index == null) return
      const lines = node.value.split("\n")
      const opts: Record<string, string> = {}
      for (let m: RegExpMatchArray | null; (m = lines[0]?.match(OPTION)); lines.shift()) opts[m[1]] ??= m[2].trim()
      const kind = TYPES.has(type) ? type : "note"
      const head = `[!${kind}]${FOLD[opts.collapse?.toLowerCase()] ?? ""} ${opts.title ?? ""}`.trimEnd()
      const md = [head, ...(lines.length ? ["", ...lines] : [])].map((l) => `> ${l}`.trimEnd()).join("\n")
      const sub = parser.parse(md) as MdRoot
      convert(sub)
      visit(sub, (n) => void delete n.position)
      const bq = sub.children[0] as Blockquote
      const color = opts.color && colorTriplet(opts.color)
      if (color) bq.data = { calloutColor: color } as Blockquote["data"]
      parent.children[index] = bq
      return SKIP
    })
  return convert
}
