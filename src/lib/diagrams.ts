import type { Plugin } from "unified"
import type { Root as MdRoot, Code } from "mdast"
import { visit } from "unist-util-visit"
import { escapeAttr } from "./obsidian"
import { readCache, writeCache } from "./render-cache"
import { site } from "../site.config"

/**
 * Text-to-diagram blocks:
 *
 * - ```d2 and ```typst are drawn into SVG at build time, by D2's WASM build and
 *   the Typst compiler. Both are optional dependencies, like the embeddings
 *   model: without them the block shows its source with a notice.
 * - ```abc (sheet music, abcjs) and ```markmap / ```mindmap (mind maps) are
 *   drawn in the browser, which loads their library only on pages that have
 *   one. A mind map is parsed here, so the page ships data, not a parser.
 */

export const DIAGRAM_LANGS = ["d2", "typst", "abc", "markmap", "mindmap"]

export class DiagramUnavailable extends Error {}

const error = (kind: string, message: string) => `<p class="dataview dv-error">${kind}: ${escapeAttr(message)}</p>`

/** The source as a code block with a notice of what is missing, when a renderer is not installed. */
function unavailable(kind: string, pkg: string, source: string): string {
  return (
    `<div class="diagram-missing"><p class="dataview dv-error">${kind} needs ${pkg}: install it next to datme (bun add ${pkg}).</p>` +
    `<pre><code>${escapeAttr(source)}</code></pre></div>`
  )
}

/** An optional package, loaded only when a note needs it; undefined when it is not installed. */
async function optional<T>(name: string): Promise<T | undefined> {
  try {
    // A variable keeps bundlers from resolving the optional package at build time.
    const pkg = name
    return (await import(/* @vite-ignore */ pkg)) as T
  } catch {
    return undefined
  }
}

// ---- D2 ----

interface D2Module {
  D2: new () => {
    /** Resolves once the worker running D2's WASM is up. */
    ready: Promise<void>
    /** A worker thread under Node. */
    worker?: { ref?(): void; unref?(): void }
    compile(source: string): Promise<{ diagram: unknown; renderOptions: Record<string, unknown> }>
    render(diagram: unknown, options: Record<string, unknown>): Promise<string>
  }
}

/** D2 reports mistakes as a JSON list of `{ errmsg }`. */
function d2Message(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  try {
    const list = JSON.parse(raw) as { errmsg?: string }[]
    if (Array.isArray(list)) return list.map((x) => x.errmsg ?? "").filter(Boolean).join("; ") || raw
  } catch {
    // not JSON: the message as it is
  }
  return raw
}

let d2: Promise<InstanceType<D2Module["D2"]> | undefined> | undefined

/**
 * A D2 diagram as SVG in the light theme, carrying the dark one too. D2 writes
 * its dark colours under `prefers-color-scheme`; they are moved under the
 * site's own theme switch, so the toggle in the header applies to them.
 */
export function renderD2(source: string): Promise<string> {
  // D2's worker answers one request at a time: a second one sent meanwhile would take the first one's answer.
  const job = d2Queue.then(() => drawD2(source))
  d2Queue = job.catch(() => {})
  return job
}

let d2Queue: Promise<unknown> = Promise.resolve()

async function drawD2(source: string): Promise<string> {
  d2 ??= optional<D2Module>("@terrastruct/d2").then((m) => (m ? new m.D2() : undefined))
  const engine = await d2
  if (!engine) throw new DiagramUnavailable("@terrastruct/d2")
  await engine.ready
  // D2 runs in a worker thread, which would keep `datme build` alive once it is done: it only counts while drawing.
  engine.worker?.ref?.()
  try {
    return await drawWith(engine, source)
  } finally {
    engine.worker?.unref?.()
  }
}

async function drawWith(engine: InstanceType<D2Module["D2"]>, source: string): Promise<string> {
  let compiled: Awaited<ReturnType<typeof engine.compile>>
  try {
    compiled = await engine.compile(source)
  } catch (e) {
    throw new Error(d2Message(e))
  }
  const { diagram, renderOptions } = compiled
  const svg = await engine.render(diagram, { ...renderOptions, pad: 16, noXMLTag: true, darkThemeID: 200 })
  return (
    svg
      .replace(/@media screen and \(prefers-color-scheme:\s*dark\)\s*\{/g, ':root[data-theme="dark"]{')
      // The outer SVG has no size of its own, so it would stretch to the column; it keeps its drawn size instead.
      .replace(/^<svg\b([^>]*?) viewBox="0 0 ([\d.]+) ([\d.]+)"/, '<svg$1 viewBox="0 0 $2 $3" width="$2" height="$3"')
  )
}

// ---- Typst ----

interface TypstModule {
  NodeCompiler: {
    create(options?: { workspace?: string }): {
      compile(input: { mainFileContent: string }): {
        hasError(): boolean
        result: unknown
        takeDiagnostics(): { shortDiagnostics: { message: string }[] } | null
      }
      svg(doc: unknown): string
    }
  }
}

let typst: Promise<ReturnType<TypstModule["NodeCompiler"]["create"]> | undefined> | undefined

/** The page fits its content, so a block is as wide as what it typesets. */
const TYPST_PAGE = "#set page(width: auto, height: auto, margin: 6pt, fill: none)\n"

/**
 * A Typst document as SVG. Black, Typst's default ink, becomes the text colour
 * of the page, so it reads in both themes; files are read from the vault.
 */
export async function renderTypst(source: string): Promise<string> {
  typst ??= optional<TypstModule>("@myriaddreamin/typst-ts-node-compiler").then((m) =>
    m ? m.NodeCompiler.create({ workspace: site.vault }) : undefined,
  )
  const compiler = await typst
  if (!compiler) throw new DiagramUnavailable("@myriaddreamin/typst-ts-node-compiler")
  const out = compiler.compile({ mainFileContent: TYPST_PAGE + source })
  if (out.hasError()) {
    const messages = out.takeDiagnostics()?.shortDiagnostics.map((d) => d.message) ?? []
    throw new Error(messages.join("; ") || "cannot compile")
  }
  // Typst measures in points, which a browser reads as pixels: scale up so the text matches the page's.
  const pt = (v: string) => Math.round((Number(v) * 400) / 3) / 100
  return String(compiler.svg(out.result))
    .replace(/(fill|stroke)="#000(?:000)?"/g, '$1="currentColor"')
    .replace(/^(<svg\b[^>]*?) width="([\d.]+)" height="([\d.]+)"/, (_m, head: string, w: string, h: string) => `${head} width="${pt(w)}" height="${pt(h)}"`)
}

// ---- markmap ----

interface MarkmapNode {
  content: string
  children: MarkmapNode[]
}

let transformer: Promise<{ transform(md: string): { root: MarkmapNode } }> | undefined

/** The tree of a mind map, parsed from its markdown: headings and nested lists. */
export async function markmapTree(source: string): Promise<MarkmapNode> {
  transformer ??= import("markmap-lib").then((m) => new m.Transformer())
  const { root } = (await transformer).transform(source)
  // Line numbers are the parser's bookkeeping; the browser only needs the tree.
  const strip = (n: MarkmapNode): MarkmapNode => ({ content: n.content, children: n.children.map(strip) })
  return strip(root)
}

/** Plain text of a node's HTML content, for the outline read by screen readers. */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " }
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, e: string) => ENTITIES[e])

function outline(n: MarkmapNode): string {
  const kids = n.children.length ? `<ul>${n.children.map(outline).join("")}</ul>` : ""
  return `<li>${escapeAttr(plain(n.content))}${kids}</li>`
}

async function renderMarkmap(source: string): Promise<string> {
  const root = await markmapTree(source)
  // The outline is the mind map for screen readers, search and paper; the SVG is drawn over it.
  return (
    `<figure class="markmap" data-markmap="${escapeAttr(JSON.stringify(root))}">` +
    `<svg aria-hidden="true"></svg><ul class="markmap-outline">${outline(root)}</ul></figure>`
  )
}

// ---- the remark plugin ----

const RENDERERS: Record<string, { kind: string; render: (source: string) => Promise<string> }> = {
  d2: { kind: "D2", render: renderD2 },
  typst: { kind: "Typst", render: renderTypst },
}

const memo = new Map<string, Promise<string>>()

/** A Typst block that reads files of the vault: its drawing changes with them, so it is never cached. */
export const READS_FILES = /#(?:image|read|include|import|json|csv|yaml|toml|xml|cbor|bibliography)\b/

/** An SVG drawn at build time, kept in memory and in the build cache. */
function drawn(lang: string, source: string): Promise<string> {
  const id = `${lang}\u0000${source}`
  const reads = lang === "typst" && READS_FILES.test(source)
  let hit = reads ? undefined : memo.get(id)
  if (!hit) {
    hit = (async () => {
      const cached = !reads && readCache("diagrams", import.meta.url, [lang, source])
      if (cached) return cached.toString("utf8")
      const { kind, render } = RENDERERS[lang]
      let html: string
      try {
        html = `<figure class="diagram diagram-${lang}">${await render(source)}</figure>`
      } catch (e) {
        if (e instanceof DiagramUnavailable) return unavailable(kind, e.message, source)
        // A mistake in the source is explained in place, and not cached: the next edit retries.
        return error(kind, (e as Error).message)
      }
      if (!reads) writeCache("diagrams", import.meta.url, [lang, source], html)
      return html
    })()
    memo.set(id, hit)
  }
  return hit
}

/** ```d2, ```typst, ```abc, ```markmap and ```mindmap blocks become diagrams. */
export const remarkDiagrams: Plugin<[], MdRoot> = () => async (tree) => {
  const jobs: Promise<void>[] = []
  visit(tree, "code", (node: Code, index, parent) => {
    const lang = node.lang?.toLowerCase()
    if (!parent || index == null || !lang || !DIAGRAM_LANGS.includes(lang)) return
    const put = (value: string) => {
      parent.children[parent.children.indexOf(node)] = { type: "html", value }
    }
    if (lang === "abc") put(`<pre class="abc" role="img" aria-label="Sheet music">${escapeAttr(node.value)}</pre>`)
    else if (lang === "markmap" || lang === "mindmap") {
      jobs.push(renderMarkmap(node.value).then(put, (e) => put(error("Mind map", (e as Error).message))))
    } else jobs.push(drawn(lang, node.value).then(put))
  })
  await Promise.all(jobs)
}
