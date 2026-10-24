import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import remarkRehype from "remark-rehype"
import rehypeRaw from "rehype-raw"
import rehypeStringify from "rehype-stringify"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import { toString as hastToString } from "hast-util-to-string"
import { visit, SKIP } from "unist-util-visit"
import type { Element, Root } from "hast"
import { preprocess } from "../src/lib/obsidian"
import { renderMarkdown } from "../src/lib/markdown"
import { site } from "../src/site.config"

/**
 * Every example of the CommonMark and GFM specs, run through the converter
 * and the renderer of notes: Obsidian's syntax must never break plain markdown.
 */

interface Example {
  id: string
  markdown: string
  html: string
}

const dir = path.join(import.meta.dir, "fixtures/spec")
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
const commonmark: Record<string, Example[]> = {}
for (const e of read("commonmark-0.31.2.json") as { section: string; example: number; markdown: string; html: string }[]) {
  ;(commonmark[e.section] ??= []).push({ id: `commonmark ${e.example}`, markdown: e.markdown, html: e.html })
}
const gfm: Record<string, Example[]> = {}
for (const e of read("gfm-0.29-extensions.json") as { extension: string; example: number; markdown: string; html: string }[]) {
  ;(gfm[e.extension] ??= []).push({ id: `gfm ${e.example}`, markdown: e.markdown, html: e.html })
}

/** Where Obsidian reads markdown its own way, and datme with it. */
const OBSIDIAN: Record<string, string> = {
  "commonmark 64": "#hashtag is a tag",
  "commonmark 484": "a link to a note that is not published is plain text",
  "commonmark 548": "[[foo]] is a wikilink",
  "commonmark 559": "[[*foo* bar]] is a wikilink",
  "commonmark 590": "![[foo]] is an embed",
}

/**
 * Where remark-gfm, which datme builds on, or the comparison itself, differs
 * from the spec: datme must then give what remark gives.
 */
const REMARK: Record<string, string> = {
  "commonmark 21": "an unclosed raw tag closes differently",
  "commonmark 31": "an unclosed raw tag closes differently",
  "commonmark 171": "a <textarea> loses its first newline when parsed",
  "commonmark 187": "an unclosed raw tag closes differently",
  "commonmark 344": "an unclosed raw tag closes differently",
  "commonmark 476": "an unclosed raw tag closes differently",
  "commonmark 477": "an unclosed raw tag closes differently",
  "commonmark 494": "an unclosed raw tag closes differently",
  "commonmark 602": "GFM links a bare URL",
  "commonmark 606": "GFM links a bare address",
  "commonmark 608": "GFM links a bare URL",
  "commonmark 611": "GFM links a bare URL",
  "commonmark 612": "GFM links a bare address",
  "commonmark 613": "an unclosed raw tag closes differently",
  "commonmark 614": "an unclosed raw tag closes differently",
  "commonmark 615": "an unclosed raw tag closes differently",
  "commonmark 616": "an unclosed raw tag closes differently",
  "commonmark 630": "an unclosed raw tag closes differently",
  "commonmark 631": "an unclosed raw tag closes differently",
  "commonmark 642": "an unclosed raw tag closes differently",
  "commonmark 643": "an unclosed raw tag closes differently",
  "gfm 628": "remark-gfm does not link ftp:// URLs",
}

/** Attributes that carry meaning; the rest (ids, classes, lazy loading, link targets) is datme's decoration. */
const MEANING = new Set(["href", "src", "alt", "title", "start", "type", "checked", "disabled", "align"])

/** The HTML with datme's decoration left out, written the same way for both sides of a comparison. */
function normalize(html: string): string {
  const tree: Root = fromHtml(html, { fragment: true })
  visit(tree, "comment", (c) => {
    c.value = ""
  })
  visit(tree, "element", (node: Element, index, parent) => {
    const cls = (node.properties.className as string[] | undefined) ?? []
    if (parent && index != null && (cls.includes("heading-anchor") || cls.includes("sidenote"))) {
      parent.children.splice(index, 1)
      return index
    }
    if (parent && index != null && (cls.includes("table-wrap") || cls.includes("code-figure"))) {
      parent.children.splice(index, 1, ...node.children)
      return index
    }
    // Shiki colours the code and drops its trailing newlines; the code itself must stay the same.
    if (node.tagName === "pre") {
      const code = hastToString(node).replace(/\n+$/, "")
      node.properties = {}
      node.children = [{ type: "element", tagName: "code", properties: {}, children: [{ type: "text", value: code }] }]
      return SKIP
    }
    node.properties = Object.fromEntries(
      Object.entries(node.properties)
        .filter(([k]) => MEANING.has(k))
        .sort(([a], [b]) => a.localeCompare(b)),
    )
  })
  // A raw tag left open is closed again after its paragraph by the HTML parser: an empty copy, not content.
  tree.children = tree.children.filter((c) => !(c.type === "element" && c.tagName === "a" && !c.children.length))
  return toHtml(tree).replace(/>\s+</g, "><").trim()
}

// A bare URL would become a card read from the network: the specs are about markdown, offline.
const linkPreviews = site.linkPreviews
// The first block in a language loads its grammar, which can pass a test's 5 s on a slow CI runner:
// every language the examples name is highlighted once here, so no example pays for it.
const languages = [...Object.values(commonmark), ...Object.values(gfm)]
  .flat()
  .flatMap((e) => [...e.markdown.matchAll(/^ {0,3}(?:`{3,}|~{3,})[ \t]*([\w+#-]+)/gm)].map((m) => m[1]))
beforeAll(async () => {
  site.linkPreviews = false
  await datme([...new Set(languages)].map((lang) => `\`\`\`\`${lang}\nx\n\`\`\`\``).join("\n\n"))
}, 120_000)
afterAll(() => {
  site.linkPreviews = linkPreviews
})

const ctx = { lang: "en-US", dir: "", resolveNote: () => undefined, resolveAsset: () => undefined }

/** The note's HTML; a paragraph goes first, so a leading heading is not taken out as the page title. */
async function datme(markdown: string): Promise<string> {
  const html = await renderMarkdown(preprocess("lead\n\n" + markdown, ctx).md, "en-US", "spec")
  return normalize(html.replace(/^<p>lead<\/p>/, ""))
}

const remark = (markdown: string) =>
  normalize(
    String(unified().use(remarkParse).use(remarkGfm).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeStringify).processSync(markdown)),
  )

function suite(name: string, sections: Record<string, Example[]>) {
  describe(name, () => {
    for (const [section, examples] of Object.entries(sections)) {
      describe(section, () => {
        for (const e of examples) {
          const why = OBSIDIAN[e.id] ?? REMARK[e.id]
          test(why ? `${e.id} (${why})` : e.id, async () => {
            const spec = normalize(e.html)
            const got = await datme(e.markdown)
            if (OBSIDIAN[e.id]) {
              // Once datme follows the spec here, the exception has to go.
              expect(got).not.toBe(spec)
            } else if (REMARK[e.id]) {
              expect(remark(e.markdown)).not.toBe(spec)
              expect(got).toBe(remark(e.markdown))
            } else expect(got).toBe(spec)
          })
        }
      })
    }
  })
}

suite("CommonMark 0.31.2", commonmark)
suite("GFM 0.29 extensions", gfm)

test("every exception names an example of the specs", () => {
  const ids = new Set([...Object.values(commonmark), ...Object.values(gfm)].flat().map((e) => e.id))
  for (const id of [...Object.keys(OBSIDIAN), ...Object.keys(REMARK)]) expect(ids.has(id) ? id : `missing: ${id}`).toBe(id)
})

/** Footnotes and math are in neither spec: datme must render them as remark-gfm and remark-math do. */
describe("footnotes and math", () => {
  const reference = (markdown: string) =>
    normalize(
      String(
        unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkMath)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypeRaw)
          .use(rehypeKatex)
          .use(rehypeStringify)
          .processSync(markdown),
      ),
    )
  const cases = [
    "Text[^1].\n\n[^1]: A note with *emphasis*.",
    "A[^a] and B[^b].\n\n[^a]: First.\n[^b]: Second,\n    continued.",
    "T[^long].\n\n[^long]: Has `code` and a [link](https://example.com).",
    "Inline $a_1 = b_1$ with _under_ and `code $x$`.",
    "$$\n\\int_0^1 x\\,dx\n$$",
    "> $$\n> x^2\n> $$",
    "- $x$ in a list\n- and $\\frac{1}{2}$",
    "| a | b |\n|---|---|\n| $x$ | 2 |",
  ]
  for (const markdown of cases) {
    test(JSON.stringify(markdown), async () => {
      expect(await datme(markdown)).toBe(reference(markdown))
    })
  }
})
