import { describe, expect, test } from "bun:test"
import { bundledLanguages, createHighlighter } from "shiki"
import { unified } from "unified"
import { fromHtml } from "hast-util-from-html"
import rehypeStringify from "rehype-stringify"
import { loadLanguages, rehypeHighlight } from "../src/lib/highlight"

const themes = ["github-light", "github-dark"]
const options = { themes: { light: themes[0], dark: themes[1] }, defaultColor: false as const }
// Markdown that holds fences of other languages, tagged templates, vue interpolations.
const sample = 'const q = html`<b>${x}</b>`; css`a{color:red}`\n```python\nprint("hi")\n```\n{{ x }} <div v-if="a">t</div>\n'

describe("highlighting with grammars loaded on demand", () => {
  test("matches having every grammar loaded, embedded and injected ones included", async () => {
    const full = await createHighlighter({ themes, langs: Object.keys(bundledLanguages) })
    for (const lang of ["markdown", "ts", "jsx", "vue", "html", "angular-ts", "mdx"]) {
      const lazy = await createHighlighter({ themes, langs: [] })
      await loadLanguages(lazy, [lang])
      expect(lazy.codeToHtml(sample, { lang, ...options })).toBe(full.codeToHtml(sample, { lang, ...options }))
      lazy.dispose()
    }
    full.dispose()
  }, 30_000)

  test("highlights the blocks of a page, and falls back to plain text for unknown languages", async () => {
    const run = async (html: string) => {
      const processor = unified()
        .use(rehypeHighlight, { ...options, fallbackLanguage: "text", defaultLanguage: "text" })
        .use(rehypeStringify)
      return processor.stringify(await processor.run(fromHtml(html, { fragment: true })))
    }
    const out = await run('<pre><code class="language-ts">let a = 1</code></pre><pre><code class="language-nope">x</code></pre><pre><code>y</code></pre>')
    expect(out).toContain("--shiki-light:")
    expect(out.match(/<pre/g)).toHaveLength(3)
    expect(out).toContain('<span class="line"><span>x</span></span>')
    expect(out).toContain('<span class="line"><span>y</span></span>')
  })
})
