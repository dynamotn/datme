import { unified, type Plugin } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkRehype from "remark-rehype"
import rehypeRaw from "rehype-raw"
import rehypeKatex from "rehype-katex"
import rehypeSlug from "rehype-slug"
import rehypeAutolinkHeadings, { type Options as AutolinkOptions } from "rehype-autolink-headings"
import rehypeShiki from "@shikijs/rehype"
import {
  transformerMetaHighlight,
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight,
} from "@shikijs/transformers"
import rehypeStringify from "rehype-stringify"
import { visit, SKIP } from "unist-util-visit"
import { toString as hastToString } from "hast-util-to-string"
import { fromHtml } from "hast-util-from-html"
import type { Root as MdRoot, Blockquote, Paragraph, PhrasingContent, Code, Text } from "mdast"
import type { Root as HastRoot, Element, ElementContent } from "hast"
import type { Lang } from "../site.config"
import { getVault, type Note } from "./vault"
import { anchorOf, escapeAttr } from "./obsidian"
import { t } from "./i18n"
import { renderDataview, renderDataviewJs, renderTasksBlock, renderSearchBlock } from "./dataview-render"
import { renderBaseView } from "./base-render"
import { renderChart } from "./charts"
import { linkTerms, glossarySignature } from "./glossary"
import { readCache, writeCache } from "./render-cache"
import { imageSize, stamp, variantPath, variantWidths, SIZES } from "./images"

export interface Heading {
  depth: number
  id: string
  text: string
}

export interface Rendered {
  html: string
  /** Text of a leading H1, hoisted out of the body to become the page title. */
  h1?: string
  headings: Heading[]
  text: string
  words: number
  description: string
}

const CALLOUT_ALIASES: Record<string, string> = {
  summary: "abstract",
  tldr: "abstract",
  hint: "tip",
  important: "tip",
  check: "success",
  done: "success",
  help: "question",
  faq: "question",
  caution: "warning",
  attention: "warning",
  fail: "failure",
  missing: "failure",
  error: "danger",
  cite: "quote",
}

/** Obsidian callouts: > [!type]± Title, foldable ones become <details>. */
const remarkCallouts: Plugin<[], MdRoot> = () => (tree) => {
  visit(tree, "blockquote", (node: Blockquote) => {
    const first = node.children[0]
    if (first?.type !== "paragraph") return
    const head = first.children[0]
    if (head?.type !== "text") return
    const m = head.value.match(/^\[!([\w-]+)\]([+-]?)[^\S\n]*/)
    if (!m) return
    const raw = m[1].toLowerCase()
    const kind = CALLOUT_ALIASES[raw] ?? raw
    const fold = m[2]
    head.value = head.value.slice(m[0].length)

    // The callout title is everything on the first line of the first paragraph.
    const title: PhrasingContent[] = []
    const rest: PhrasingContent[] = []
    let inTitle = true
    for (const child of first.children) {
      if (!inTitle) {
        rest.push(child)
        continue
      }
      if (child.type === "text" && child.value.includes("\n")) {
        const i = child.value.indexOf("\n")
        if (i > 0) title.push({ type: "text", value: child.value.slice(0, i) })
        const after = child.value.slice(i + 1)
        if (after) rest.push({ type: "text", value: after })
        inTitle = false
      } else if (child.type === "break") {
        inTitle = false
      } else title.push(child)
    }
    const hasTitle = title.some((c) => c.type !== "text" || c.value.trim())
    const titleText = raw.charAt(0).toUpperCase() + raw.slice(1)

    const titleNode: Paragraph = {
      type: "paragraph",
      children: hasTitle ? title : [{ type: "text", value: titleText }],
      data: { hName: fold ? "summary" : "div", hProperties: { className: ["callout-title"] } },
    }
    const body = [...(rest.length ? [{ ...first, children: rest }] : []), ...node.children.slice(1)]
    node.children = [
      titleNode,
      {
        type: "blockquote",
        children: body,
        data: { hName: "div", hProperties: { className: ["callout-content"] } },
      } as Blockquote,
    ]
    node.data = {
      hName: fold ? "details" : "div",
      hProperties: {
        className: ["callout"],
        dataCallout: kind,
        ...(fold === "+" ? { open: true } : {}),
      },
    }
  })
}

const BR = /<\/?br\s*\/?>\s*$/i

/**
 * Turn single newlines into line breaks, as Obsidian does unless "strict line
 * breaks" is on. A line already ending in <br> or </br> gets no second break.
 */
// Options are an object: unified reads a bare `true`/`false` as "use with defaults" / "skip".
const remarkHardBreaks: Plugin<[{ enabled: boolean }], MdRoot> = ({ enabled }) => (tree) => {
  if (!enabled) return
  visit(tree, "text", (node: Text, index, parent) => {
    if (!parent || index == null || !node.value.includes("\n")) return
    const parts = node.value.split("\n")
    const out: PhrasingContent[] = []
    parts.forEach((part, i) => {
      if (i > 0) {
        const prev = out.length ? out[out.length - 1] : (parent.children[index - 1] as PhrasingContent | undefined)
        const brAlready = prev?.type === "html" && BR.test(prev.value)
        if (!brAlready) out.push({ type: "break" })
      }
      if (part) out.push({ type: "text", value: part })
    })
    ;(parent.children as PhrasingContent[]).splice(index, 1, ...out)
    return index + out.length
  })
}

/** ```dataview queries run over the published notes; DataviewJS only gets a notice. */
const remarkDataview: Plugin<[{ lang: Lang; key: string }], MdRoot> = ({ lang, key }) => (tree) => {
  visit(tree, "code", (node: Code, index, parent) => {
    if (!parent || index == null) return
    if (node.lang === "dataview" || node.lang === "tasks") {
      const out = node.lang === "tasks" ? renderTasksBlock(node.value, lang) : renderDataview(node.value, lang, key)
      if (typeof out === "string") parent.children[index] = { type: "html", value: out }
      else {
        // TASK results are markdown, parsed in place so each task renders like the rest of the note.
        const root = unified().use(remarkParse).use(remarkGfm).parse(out.markdown)
        parent.children.splice(index, 1, ...(root.children as typeof parent.children))
        return index + root.children.length
      }
    } else if (node.lang === "dataviewjs") parent.children[index] = { type: "html", value: renderDataviewJs(lang) }
    else if (node.lang === "query") parent.children[index] = { type: "html", value: renderSearchBlock(node.value, lang) }
    else if (node.lang === "chart") parent.children[index] = { type: "html", value: renderChart(node.value) }
  })
}

/** ```mermaid blocks are rendered in the browser; other blocks keep their meta string. */
const remarkMermaid: Plugin<[], MdRoot> = () => (tree) => {
  visit(tree, "code", (node: Code, index, parent) => {
    // rehype-raw drops node data, so the meta (title, {1-3}) travels as an attribute Shiki reads.
    if (node.meta) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, metastring: node.meta } }
    if (node.lang !== "mermaid" || !parent || index == null) return
    parent.children[index] = {
      type: "html",
      value: `<pre class="mermaid">${escapeAttr(node.value)}</pre>`,
    }
  })
}

interface DecorateOpts {
  out: Partial<Rendered>
}

const SKIP_CLASSES = ["heading-anchor", "katex-mathml", "block-id"]

/**
 * Text a reader would see, for search and descriptions: leaves out code blocks
 * (mostly Dataview queries), heading anchors and KaTeX's hidden MathML.
 */
function readable(node: HastRoot | ElementContent): string {
  const parts: string[] = []
  const walk = (n: HastRoot | ElementContent) => {
    if (n.type === "text") parts.push(n.value)
    else if (n.type === "element") {
      if (n.tagName === "pre" || n.tagName === "script" || n.tagName === "style") return
      const cls = (n.properties.className as string[] | undefined) ?? []
      if (cls.some((c) => SKIP_CLASSES.includes(c))) return
      n.children.forEach(walk)
      // Block elements end a word even without whitespace between them.
      if (/^(p|li|h[1-6]|div|td|th|blockquote)$/.test(n.tagName)) parts.push(" ")
    } else if (n.type === "root") n.children.forEach((c) => walk(c as ElementContent))
  }
  walk(node)
  return parts.join("").replace(/\s+/g, " ").trim()
}

/** Links, images, tables and headings, plus hoisting of the leading H1. */
const rehypeDecorate: Plugin<[DecorateOpts], HastRoot> = ({ out }) => (tree) => {
  const firstEl = tree.children.find((c) => c.type === "element") as Element | undefined
  if (firstEl?.tagName === "h1") {
    out.h1 = hastToString(firstEl).replace(/#$/, "").trim()
    tree.children.splice(tree.children.indexOf(firstEl), 1)
  }
  const headings: Heading[] = []
  visit(tree, "element", (node: Element, index, parent) => {
    const tag = node.tagName
    if (/^h[2-4]$/.test(tag) && node.properties.id) {
      headings.push({
        depth: Number(tag[1]),
        id: String(node.properties.id),
        text: hastToString(node).replace(/#$/, "").trim(),
      })
    }
    if (tag === "a") {
      const href = String(node.properties.href ?? "")
      if (/^https?:\/\//.test(href)) {
        node.properties.target = "_blank"
        node.properties.rel = ["noopener", "noreferrer"]
        node.properties.className = [...((node.properties.className as string[]) ?? []), "external"]
      }
    }
    if (tag === "img") node.properties.loading = "lazy"
    // A chart's data table is hidden, so it needs no scrolling frame.
    const chartData = (node.properties.className as string[] | undefined)?.includes("chart-data")
    if (tag === "table" && !chartData && parent && index != null) {
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: { className: ["table-wrap"] },
        children: [node],
      }
      return SKIP
    }
  })
  out.headings = headings
  const text = readable(tree)
  out.text = text
  out.words = text ? text.split(" ").length : 0
  // First paragraph in reading order, including ones inside callouts (often a definition).
  let firstP: Element | undefined
  visit(tree, "element", (node: Element) => {
    if (firstP) return SKIP
    if (node.tagName === "pre") return SKIP
    if (node.tagName === "p" && hastToString(node).trim()) firstP = node
  })
  const desc = firstP ? readable(firstP) : text
  out.description = desc.length > 180 ? desc.slice(0, 177).trimEnd() + "…" : desc
}

/** ```ts title="app.ts" wraps the block in a figure captioned with the file name. */
const rehypeCodeTitle: Plugin<[], HastRoot> = () => (tree) => {
  visit(tree, "element", (node: Element, index, parent) => {
    if (node.tagName !== "pre" || !parent || index == null) return
    const code = node.children.find((c): c is Element => c.type === "element" && c.tagName === "code")
    const meta = String(code?.properties.metastring ?? "")
    const title = meta.match(/(?:title|file(?:name)?)=(?:"([^"]+)"|'([^']+)'|(\S+))/)
    if (!title) return
    parent.children[index] = {
      type: "element",
      tagName: "figure",
      properties: { className: ["code-figure"] },
      children: [
        { type: "element", tagName: "figcaption", properties: {}, children: [{ type: "text", value: title[1] ?? title[2] ?? title[3] }] },
        node,
      ],
    }
    return SKIP
  })
}

/** First mentions of glossary terms link to the note defining them. */
const rehypeGlossary: Plugin<[{ lang: Lang; key: string }], HastRoot> = ({ lang, key }) => (tree) => linkTerms(tree, lang, key)

const isElement = (n: ElementContent | undefined): n is Element => n?.type === "element"

/**
 * A copy of each footnote right after its reference, shown in the margin when
 * there is room for it. Only notes whose footnotes are plain paragraphs get
 * them: a list or a code block does not fit in a margin.
 */
const rehypeSidenotes: Plugin<[], HastRoot> = () => (tree) => {
  const notes = new Map<string, ElementContent[]>()
  let plain = true
  visit(tree, "element", (node: Element) => {
    const id = String(node.properties.id ?? "")
    if (node.tagName !== "li" || !id.startsWith("user-content-fn-")) return
    const blocks = node.children.filter(isElement)
    if (blocks.some((b) => b.tagName !== "p")) plain = false
    const parts: ElementContent[] = []
    blocks.forEach((p, i) => {
      if (i) parts.push({ type: "element", tagName: "br", properties: {}, children: [] })
      parts.push(...p.children.filter((c) => !(isElement(c) && "dataFootnoteBackref" in c.properties)))
    })
    const last = parts.at(-1)
    if (last?.type === "text") last.value = last.value.trimEnd()
    notes.set(id, parts)
    return SKIP
  })
  if (!plain || !notes.size) return
  visit(tree, "element", (node: Element, index, parent) => {
    if (node.tagName !== "sup" || !parent || index == null) return
    const ref = node.children.find((c): c is Element => isElement(c) && "dataFootnoteRef" in c.properties)
    const content = ref && notes.get(String(ref.properties.href).slice(1))
    if (!ref || !content) return
    parent.children.splice(index + 1, 0, {
      type: "element",
      tagName: "span",
      properties: { className: ["sidenote"], role: "note" },
      children: [
        { type: "element", tagName: "span", properties: { className: ["sidenote-number"] }, children: [{ type: "text", value: hastToString(ref) }] },
        { type: "text", value: " " },
        ...structuredClone(content),
      ],
    })
    return index + 2
  })
}

/** Section of a rendered note under a heading or a block id. */
function extractFragment(root: HastRoot, fragment: string): ElementContent[] {
  if (!fragment) return root.children as ElementContent[]
  const id = anchorOf(fragment).slice(1)
  const kids = root.children.filter((c): c is Element => c.type === "element")
  if (fragment.startsWith("^")) {
    let found: Element | undefined
    for (const k of kids) {
      visit(k, "element", (el: Element) => {
        if (el.properties.id === id) found = k
      })
      if (found) break
    }
    return found ? [found] : []
  }
  const start = kids.findIndex((k) => /^h[1-6]$/.test(k.tagName) && k.properties.id === id)
  if (start < 0) return []
  const level = Number(kids[start].tagName[1])
  const out: ElementContent[] = [kids[start]]
  for (const k of kids.slice(start + 1)) {
    if (/^h[1-6]$/.test(k.tagName) && Number(k.tagName[1]) <= level) break
    out.push(k)
  }
  return out
}

/** Replace ![[note]] placeholders with the rendered target note. */
const rehypeTransclude: Plugin<[{ lang: Lang; stack: string[] }], HastRoot> =
  ({ lang, stack }) =>
  async (tree) => {
    // A paragraph holding only an embed is replaced by the embed, so no <div> lands inside a <p>.
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || !parent || index == null) return
      const kids = node.children.filter((c) => c.type !== "text" || c.value.trim())
      const only = kids[0]
      const embed = only?.type === "element" && (only.properties.className as string[] | undefined)?.some((c) => c === "transclude-ph" || c === "base-ph")
      if (kids.length === 1 && embed) {
        parent.children[index] = only
      }
    })
    // ![[x.base#View]] renders that view of the base in place.
    visit(tree, "element", (node: Element, index, parent) => {
      if (!(node.properties.className as string[] | undefined)?.includes("base-ph") || !parent || index == null) return
      const doc = getVault().docs.get(String(node.properties.dataRel))
      const view = String(node.properties.dataView ?? "") || undefined
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: { className: ["base-embed"] },
        children: doc ? (fromHtml(renderBaseView(doc, view, lang), { fragment: true }).children as ElementContent[]) : [],
      }
      return SKIP
    })
    const jobs: Promise<void>[] = []
    visit(tree, "element", (node: Element, index, parent) => {
      const cls = node.properties.className as string[] | undefined
      if (!cls?.includes("transclude-ph") || !parent || index == null) return
      const key = String(node.properties.dataKey)
      const fragment = String(node.properties.dataFragment ?? "")
      const target = getVault().byKey[lang].get(key)
      jobs.push(
        (async () => {
          let children: ElementContent[] = []
          if (target && !stack.includes(key) && stack.length < 4) {
            const r = await renderNote(target, [...stack, key])
            children = extractFragment(fromHtml(r.html, { fragment: true }), fragment)
          }
          const href = target ? target.url + anchorOf(fragment) : "#"
          const embed: Element = {
            type: "element",
            tagName: "div",
            properties: { className: ["transclude"], dataUrl: href },
            children: [
              {
                type: "element",
                tagName: "a",
                properties: { className: ["transclude-src", "internal"], href, dataKey: key },
                children: [
                  { type: "text", value: `${target?.protected ? "🔒 " : ""}${t(lang).transcludeFrom} ${target?.title ?? key}` },
                ],
              },
              ...children,
            ],
          }
          parent.children[index] = embed
        })(),
      )
    })
    await Promise.all(jobs)
  }

/** Vault path of an /assets/ URL. */
function assetOf(src: string): string | undefined {
  if (!src.startsWith("/assets/")) return undefined
  try {
    return src.slice("/assets/".length).split("/").map(decodeURIComponent).join("/")
  } catch {
    return undefined
  }
}

/**
 * Images of the vault get their size, so the page does not jump while they
 * load, and a srcset of resized WebP copies for small screens.
 */
const rehypeImages: Plugin<[], HastRoot> = () => async (tree) => {
  const imgs: Element[] = []
  visit(tree, "element", (node: Element) => {
    // Images of an embedded note were sized when that note rendered.
    if (node.tagName === "img" && !node.properties.decoding && assetOf(String(node.properties.src ?? ""))) imgs.push(node)
  })
  await Promise.all(
    imgs.map(async (img) => {
      const rel = assetOf(String(img.properties.src))!
      const size = await imageSize(rel)
      if (!size) return
      const w = Number(img.properties.width) || undefined
      const h = Number(img.properties.height) || undefined
      // An Obsidian size like ![[x.png|300]] sets the width only; keep the ratio.
      img.properties.width = w ?? size.width
      img.properties.height = h ?? Math.round(((w ?? size.width) * size.height) / size.width)
      img.properties.decoding = "async"
      const widths = variantWidths(size.width)
      if (!widths.length) return
      img.properties.srcset = [...widths.map((v) => `${variantPath(rel, v)} ${v}w`), `${img.properties.src} ${size.width}w`].join(", ")
      img.properties.sizes = w ? `(max-width: ${w}px) 100vw, ${w}px` : SIZES
    }),
  )
}

const autolink: AutolinkOptions = {
  behavior: "append",
  properties: { className: ["heading-anchor"], ariaHidden: "true", tabIndex: -1 },
  content: { type: "text", value: "#" },
}

const cache = new Map<string, Promise<Rendered>>()

function processorFor(lang: Lang, stack: string[], out: Partial<Rendered>, hardBreaks = false) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkHardBreaks, { enabled: hardBreaks })
    .use(remarkMath)
    .use(remarkCallouts)
    .use(remarkDataview, { lang, key: stack[stack.length - 1] })
    .use(remarkMermaid)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, autolink)
    .use(rehypeDecorate, { out })
    .use(rehypeCodeTitle)
    .use(rehypeGlossary, { lang, key: stack[stack.length - 1] })
    .use(rehypeSidenotes)
    .use(rehypeShiki, {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
      lazy: true,
      fallbackLanguage: "text",
      addLanguageClass: true,
      // ```ts {2,4-5} marks lines; // [!code highlight|++|--|focus] comments mark them inline.
      transformers: [
        transformerMetaHighlight(),
        transformerNotationHighlight(),
        transformerNotationDiff(),
        transformerNotationFocus(),
      ],
    })
    .use(rehypeTransclude, { lang, stack })
    .use(rehypeImages)
    .use(rehypeStringify, { allowDangerousHtml: true })
}

/**
 * Whether a note renders the same whatever the rest of the vault holds, so its
 * HTML can be reused across builds: no embeds, queries or bases, and never a
 * protected note, whose content must not reach the disk unencrypted.
 */
function isSelfContained(note: Note): boolean {
  return !note.protected && !/transclude-ph|base-ph/.test(note.md) && !/^\s*(`{3,}|~{3,})\s*(dataview|tasks|query)/im.test(note.md)
}

type Parts = Omit<Rendered, "description"> & { description?: string }

function renderFull(note: Note, stack: string[]): Promise<Rendered> {
  const variant = stack.length > 1 ? "embed" : "page"
  const id = `${getVault().version}:${note.lang}:${note.key}:${variant}`
  let hit = cache.get(id)
  if (!hit) {
    hit = (async () => {
      // Image sizes end up in the HTML, so a replaced image must invalidate it too.
      const diskKey = isSelfContained(note)
        ? [note.lang, variant, String(note.hardBreaks), note.md, glossarySignature(note.lang), ...note.assets.map((a) => `${a}@${stamp(a)}`)]
        : undefined
      const cached = diskKey && readCache("notes", import.meta.url, diskKey)
      let parts: Parts
      if (cached) parts = JSON.parse(cached.toString("utf8"))
      else {
        const out: Partial<Rendered> = {}
        const file = await processorFor(note.lang, stack, out, note.hardBreaks).process(note.md)
        parts = {
          html: String(file),
          h1: out.h1,
          headings: out.headings ?? [],
          text: out.text ?? "",
          words: out.words ?? 0,
          description: out.description,
        }
        if (diskKey) writeCache("notes", import.meta.url, diskKey, JSON.stringify(parts))
      }
      // The frontmatter description is not part of the markdown, so it is applied after the cache.
      return { ...parts, description: note.description ?? parts.description ?? "" }
    })()
    cache.set(id, hit)
  }
  return hit
}

const SEALED: Rendered = { html: "", headings: [], text: "", words: 0, description: "" }

/**
 * Render a note for public use: cards, feeds, search, embeds and the page itself.
 * A protected note renders as empty here, so its content cannot leak anywhere;
 * only renderSecret hands it out, to be encrypted.
 */
export function renderNote(note: Note, stack: string[] = [note.key]): Promise<Rendered> {
  return note.protected ? Promise.resolve(SEALED) : renderFull(note, stack)
}

/** Render already preprocessed markdown that is not a note, such as a canvas card. */
export async function renderMarkdown(md: string, lang: Lang, key: string): Promise<string> {
  return String(await processorFor(lang, [key], {}).process(md))
}

/** The full rendering of a protected note, only for encrypting its page. */
export function renderSecret(note: Note): Promise<Rendered> {
  return renderFull(note, [note.key])
}
