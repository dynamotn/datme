import { fromHtml } from "hast-util-from-html"
import { find, html as htmlSchema } from "property-information"
import type { ElementContent, Properties, RootContent } from "hast"

/**
 * Templates of theme packs: logic-less HTML for a few slots of a page, with `{{field}}`
 * placeholders, `{{#if field}}`, `{{#unless field}}` and `{{#each list}}` blocks. A template is
 * parsed once, when the pack is loaded, and kept only as the elements and attributes allowed
 * below; every value is escaped where it lands, and a link or picture keeps only an http(s),
 * mailto or relative address. Nothing of a template ever runs: what is left out is a warning.
 */

/** Fields of each item of a list a template can walk with {{#each}}. */
export const LIST_FIELDS: Record<string, readonly string[]> = { tags: ["name", "url"] }

const COMMON = ["siteTitle", "home", "lang"] as const

/** The slots a pack can fill, each with the fields its template is given. */
export const SLOT_FIELDS = {
  "header-brand": [...COMMON, "logo"],
  "note-card": [
    ...COMMON,
    "title",
    "url",
    "excerpt",
    "date",
    "datetime",
    "cover",
    "stage",
    "stageIcon",
    "type",
    "typeIcon",
    "readingTime",
    "locked",
    "featured",
    "tags",
  ],
  "note-row": [...COMMON, "title", "url", "date", "datetime", "stage", "stageIcon", "type", "typeIcon", "locked", "tags"],
  "note-footer": [...COMMON, "title", "url", "date", "datetime", "stage", "stageIcon", "author", "locked", "tags"],
  "footer-band": [...COMMON, "author", "year", "rss"],
} as const satisfies Record<string, readonly string[]>

export type Slot = keyof typeof SLOT_FIELDS
export const SLOTS = Object.keys(SLOT_FIELDS) as Slot[]

/** What a template is given: text, a flag for {{#if}}, or a list for {{#each}}. */
export type FieldValue = string | number | boolean | undefined | Record<string, string>[]
export type Fields = Record<string, FieldValue>

/** A piece of text or of an attribute's value: as written, or a field. */
type Part = string | { field: string }
export type TemplateNode =
  | { kind: "text"; parts: Part[] }
  | { kind: "element"; tag: string; attrs: { name: string; parts: Part[]; url: boolean }[]; children: TemplateNode[] }
  | { kind: "block"; block: "if" | "unless" | "each"; field: string; children: TemplateNode[] }

/** Elements a template keeps; any other is left out with what it holds. */
const TAGS = new Set(
  "a abbr article aside b bdi bdo blockquote br caption cite code col colgroup data dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hgroup hr i img ins kbd li mark nav ol p pre q rp rt ruby s samp section small span strong sub summary sup table tbody td tfoot th thead time tr u ul var wbr".split(
    " ",
  ),
)
const VOID = new Set(["br", "col", "hr", "img", "wbr"])
/** Elements a slot drawn inside a link cannot hold. */
const INTERACTIVE = new Set(["a", "details", "summary"])
const GLOBAL_ATTRS = new Set(["class", "title", "lang", "dir", "role", "hidden", "translate", "style"])
const TAG_ATTRS: Record<string, string[]> = {
  a: ["href", "rel", "hreflang"],
  img: ["src", "alt", "width", "height", "loading", "decoding"],
  time: ["datetime"],
  del: ["datetime", "cite"],
  ins: ["datetime", "cite"],
  blockquote: ["cite"],
  q: ["cite"],
  data: ["value"],
  ol: ["start", "reversed", "type"],
  li: ["value"],
  td: ["colspan", "rowspan", "headers"],
  th: ["colspan", "rowspan", "headers", "scope", "abbr"],
  col: ["span"],
  colgroup: ["span"],
  details: ["open"],
}
const URL_ATTRS = new Set(["href", "src", "cite"])

/** Whether an address is relative or http(s) or mailto; browsers skip blanks and controls in a scheme. */
export function safeUrl(value: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value.replace(/[\u0000-\u0020\u007f-\u009f]/g, ""))
  return !scheme || ["http", "https", "mailto"].includes(scheme[1].toLowerCase())
}

/** Whether inline CSS stays inert: nothing that loads a file or runs, and no escapes or comments to hide one. */
export function safeStyle(css: string): boolean {
  return !/url\s*\(|image-set|expression|javascript|behavior|binding|@import|["'\\<]|\/\*/i.test(css)
}

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;")

/** A tag as warnings show it. */
const tagOf = (name: string) => `<${name}>`

interface Context {
  slot: Slot
  warn: (message: string) => void
  /** Fields known where a placeholder sits: the slot's, and an item's inside {{#each}}. */
  fields: Set<string>
  /** Whether the slot is drawn inside a link. */
  inLink: boolean
}

/** Splits text into what is written and its placeholders, as tokens; a placeholder datme does not know is dropped. */
function tokens(text: string, ctx: Context): (Part | { open: "if" | "unless" | "each"; field: string } | { close: string })[] {
  const out: (Part | { open: "if" | "unless" | "each"; field: string } | { close: string })[] = []
  let last = 0
  for (const m of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    last = m.index + m[0].length
    const inner = m[1].trim()
    const open = /^#(if|unless|each)\s+([A-Za-z]\w*)$/.exec(inner)
    const close = /^\/(if|unless|each)$/.exec(inner)
    if (open) out.push({ open: open[1] as "if" | "unless" | "each", field: open[2] })
    else if (close) out.push({ close: close[1] })
    else if (/^[A-Za-z]\w*$/.test(inner)) out.push({ field: inner })
    else ctx.warn(`${m[0]} is not a placeholder datme knows, so it is left out`)
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Checks that a field exists where it is used, and is text or a list as it is used. */
function known(field: string, ctx: Context, as: "text" | "flag" | "list"): boolean {
  if (!ctx.fields.has(field)) {
    ctx.warn(`{{${field}}} is not a field of ${ctx.slot} (${[...ctx.fields].join(", ")}), so it is left out`)
    return false
  }
  const list = field in LIST_FIELDS
  if (as === "list" && !list) ctx.warn(`{{#each ${field}}} needs a list, and ${field} is not one, so it is left out`)
  else if (as === "text" && list) ctx.warn(`{{${field}}} is a list: walk it with {{#each ${field}}}, so it is left out`)
  else return true
  return false
}

/** An attribute's value as datme writes it, from hast's property. */
function attrValue(value: Properties[string], commas: boolean): string | undefined {
  if (value === false || value == null) return undefined
  if (value === true) return ""
  return Array.isArray(value) ? value.join(commas ? ", " : " ") : String(value)
}

function compileElement(node: Extract<RootContent, { type: "element" }>, ctx: Context): TemplateNode | undefined {
  const tag = node.tagName.toLowerCase()
  if (!TAGS.has(tag)) {
    ctx.warn(`${tagOf(node.tagName)} is not an element a template can hold, so it is left out with what it holds`)
    return undefined
  }
  if (ctx.inLink && INTERACTIVE.has(tag)) {
    ctx.warn(`${tagOf(tag)} cannot sit in ${ctx.slot}, which is drawn inside a link, so it is left out with what it holds`)
    return undefined
  }
  const attrs: { name: string; parts: Part[]; url: boolean }[] = []
  for (const [prop, raw] of Object.entries(node.properties)) {
    const info = find(htmlSchema, prop)
    const name = info.attribute.toLowerCase()
    const value = attrValue(raw, info.commaSeparated)
    if (!GLOBAL_ATTRS.has(name) && !/^aria-[a-z]+$/.test(name) && !TAG_ATTRS[tag]?.includes(name)) {
      ctx.warn(`${tagOf(tag)}: the attribute ${name} is not one a template can set, so it is left out`)
      continue
    }
    if (value === undefined) continue
    if (name === "style" && (value.includes("{{") || !safeStyle(value))) {
      ctx.warn(`${tagOf(tag)}: a style that loads files, runs code, hides with escapes or takes a placeholder is left out`)
      continue
    }
    const url = URL_ATTRS.has(name)
    const parts: Part[] = []
    for (const token of tokens(value, ctx)) {
      if (typeof token === "string") parts.push(token)
      else if ("field" in token && !("open" in token)) {
        if (known(token.field, ctx, "text")) parts.push(token)
      } else ctx.warn(`${tagOf(tag)}: an attribute takes fields only, not blocks, so a block in ${name} is left out`)
    }
    if (url && parts.every((p) => typeof p === "string") && !safeUrl(parts.join(""))) {
      ctx.warn(`${tagOf(tag)}: ${name} must be an http(s), mailto or relative address, so it is left out`)
      continue
    }
    attrs.push({ name, parts, url })
  }
  return { kind: "element", tag, attrs, children: VOID.has(tag) ? [] : compileChildren(node.children, ctx) }
}

/** Compiles siblings: a block opens and closes among the same siblings, around text and elements. */
function compileChildren(children: (RootContent | ElementContent)[], ctx: Context): TemplateNode[] {
  const root: TemplateNode[] = []
  const stack: { block?: Extract<TemplateNode, { kind: "block" }>; opened?: string; out: TemplateNode[]; fields: Set<string> }[] = [
    { out: root, fields: ctx.fields },
  ]
  const top = () => stack[stack.length - 1]
  const at = (): Context => ({ ...ctx, fields: top().fields })
  const pushText = (part: Part) => {
    const out = top().out
    const last = out[out.length - 1]
    if (last?.kind === "text") last.parts.push(part)
    else out.push({ kind: "text", parts: [part] })
  }
  for (const child of children) {
    if (child.type === "element") {
      const el = compileElement(child, at())
      if (el) top().out.push(el)
    } else if (child.type === "text") {
      for (const token of tokens(child.value, at())) {
        if (typeof token === "string") pushText(token)
        else if ("open" in token) {
          const list = token.open === "each"
          const ok = known(token.field, at(), list ? "list" : "flag")
          const block = { kind: "block" as const, block: token.open, field: ok ? token.field : "", children: [] }
          top().out.push(block)
          const fields = list && ok ? new Set([...top().fields, ...LIST_FIELDS[token.field]]) : top().fields
          stack.push({ block, opened: `{{#${token.open} ${token.field}}}`, out: block.children, fields })
        } else if ("close" in token) {
          if (top().block?.block === token.close) stack.pop()
          else ctx.warn(`{{/${token.close}}} closes no {{#${token.close}}} among its siblings, so it is left out`)
        } else if (known(token.field, at(), "text")) pushText(token)
      }
    }
    // Comments, CDATA and doctypes are left out: hast parses them as nodes of their own.
  }
  while (stack.length > 1) {
    ctx.warn(`${stack.pop()!.opened} is not closed among its siblings, so it ends with them`)
  }
  return root
}

/** Parses and sanitises a template for a slot; what had to be left out comes back as warnings. */
export function compileTemplate(source: string, slot: Slot): { nodes: TemplateNode[]; warnings: string[] } {
  const warnings: string[] = []
  const tree = fromHtml(source.trim(), { fragment: true })
  const ctx: Context = { slot, warn: (m) => warnings.push(m), fields: new Set(SLOT_FIELDS[slot]), inLink: slot === "header-brand" }
  return { nodes: compileChildren(tree.children, ctx), warnings: [...new Set(warnings)] }
}

/** A field's value from the innermost scope that has it. */
function lookup(field: string, scopes: Fields[]): FieldValue {
  for (const scope of scopes) if (field in scope) return scope[field]
  return undefined
}

/** A value as text: a flag or nothing prints as nothing; a list is never printed. */
const asText = (value: FieldValue) => (typeof value === "string" || typeof value === "number" ? String(value) : "")

const join = (parts: Part[], scopes: Fields[]) => parts.map((p) => (typeof p === "string" ? p : asText(lookup(p.field, scopes)))).join("")

function renderNodes(nodes: TemplateNode[], scopes: Fields[]): string {
  let out = ""
  for (const node of nodes) {
    if (node.kind === "text") out += escapeText(join(node.parts, scopes))
    else if (node.kind === "element") {
      let attrs = ""
      for (const a of node.attrs) {
        const value = join(a.parts, scopes)
        // A field can still turn an address into javascript: or data:, so it is checked once filled; an empty one is no address.
        if (a.url && (!value.trim() || !safeUrl(value))) continue
        attrs += ` ${a.name}="${escapeAttr(value)}"`
      }
      out += `<${node.tag}${attrs}>` + (VOID.has(node.tag) ? "" : `${renderNodes(node.children, scopes)}</${node.tag}>`)
    } else if (node.field) {
      // A block on a field datme does not know was warned about, and draws nothing.
      const value = lookup(node.field, scopes)
      if (node.block === "each") {
        for (const item of Array.isArray(value) ? value : []) out += renderNodes(node.children, [item, ...scopes])
      } else {
        const on = Array.isArray(value) ? value.length > 0 : !!value
        if (on === (node.block === "if")) out += renderNodes(node.children, scopes)
      }
    }
  }
  return out
}

/** Draws a compiled template with the fields of its slot. */
export function renderTemplate(nodes: TemplateNode[], fields: Fields): string {
  return renderNodes(nodes, [fields])
}
