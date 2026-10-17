import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { site } from "../src/site.config"
import { getVault } from "../src/lib/vault"
import { renderMarkdown, renderNote, userHead } from "../src/lib/markdown"
import * as renderCache from "../src/lib/render-cache"

const TMP = "/Users/dynamo/.claude/jobs/6fc80508/tmp/cov-d/forkC"
const FIXTURE = path.resolve(import.meta.dir, "fixtures/vault")

describe("markdown edges on the fixture vault", () => {
  test("a callout title ends at a hard line break", async () => {
    const html = await renderMarkdown("> [!tip] Short title\\\n> The body after the break.", "en-US", "x")
    expect(html).toContain('<div class="callout-title">Short title</div>')
    expect(html).toMatch(/<div class="callout-content">[\s\S]*The body after the break\./)
  })

  test("an embed of a block id brings only the block holding it", async () => {
    const ph = (fragment: string) => `<span class="transclude-ph" data-key="03_Atomic/Zettelkasten" data-fragment="${fragment}"></span>`
    const html = await renderMarkdown(ph("^core-idea"), "vi-VN", "x")
    expect(html).toContain('<div class="transclude" data-url="/03_Atomic/Zettelkasten#^core-idea">')
    expect(html).toContain("a network of notes")
    expect(html).not.toContain("Folded caveat")
    expect(html).not.toContain("Ghi chú")
  })

  test("an embed of a block id that does not exist brings only the link", async () => {
    const html = await renderMarkdown('<span class="transclude-ph" data-key="03_Atomic/Zettelkasten" data-fragment="^nowhere"></span>', "vi-VN", "x")
    expect(html).toMatch(/<div class="transclude" data-url="[^"]+"><a class="transclude-src internal"[^>]*>[^<]*<\/a><\/div>/)
    expect(html).not.toContain("a network of notes")
  })

  test("an /assets/ image with a malformed escape is left unsized", async () => {
    const html = await renderMarkdown('<img src="/assets/bad%E0%A4%A.png" alt="">', "en-US", "x")
    expect(html).toContain('<img src="/assets/bad%E0%A4%A.png" alt="" loading="lazy">')
    expect(html).not.toContain("decoding")
  })

  test("a URL in a drawing's text stays text; the drawing's own links stay links", async () => {
    const html = await renderMarkdown(
      '<div class="drawing">\n\nSee https://example.com today and <a class="drawing-link" href="/x">x</a>\n\n</div>',
      "en-US",
      "x",
    )
    expect(html).toContain("See https://example.com today")
    expect(html).not.toContain('href="https://example.com"')
    expect(html).toContain('<a class="drawing-link" href="/x">x</a>')
  })

  test("the fixture vault adds nothing to the head", async () => {
    expect(await userHead()).toBe("")
  })
})

describe("with the vault's own plugins and a warm disk cache", () => {
  const vault = path.join(TMP, `md-vault-${process.pid}`)
  const g = globalThis as { __vaultVersion?: number }
  const saved = { vault: site.vault, version: g.__vaultVersion }
  const original = { ...renderCache }
  const reads: string[][] = []

  beforeAll(() => {
    fs.rmSync(vault, { recursive: true, force: true })
    fs.mkdirSync(path.join(vault, "img"), { recursive: true })
    fs.copyFileSync(path.join(FIXTURE, "_assets/images/wide.png"), path.join(vault, "img/wide.png"))
    fs.writeFileSync(
      path.join(vault, "datme.config.mjs"),
      `export default {
  codeBlocks: {
    Greet: (source, { lang, key, meta }) => \`<p class="greet">\${source}|\${lang}|\${key}|\${meta}</p>\`,
    later: async (source) => \`<p class="later">\${source}</p>\`,
    boom: () => { throw new Error("no <way>") },
  },
  head: '<meta name="cov" content="on">',
}
`,
    )
    fs.writeFileSync(path.join(vault, "Cached.md"), "---\npublish: true\n---\nText with ![[wide.png]] inside. CACHE-ME\n")
    fs.writeFileSync(path.join(vault, "Typst.md"), "---\npublish: true\n---\nA figure.\n\n```typst\n#image(\"img/wide.png\")\n```\n")
    fs.writeFileSync(path.join(vault, "Plain typst.md"), "---\npublish: true\n---\nA sum.\n\n```typst\n$1 + 1$\n```\n")
    fs.writeFileSync(
      path.join(vault, "Foot.md"),
      "---\npublish: true\n---\nA claim.[^1] See [below](#tail) and [odd](#%E0%A4%A).\n\n[^1]: The source.\n",
    )
    site.vault = vault
    g.__vaultVersion = 7_300_001
    // Every note read from the disk cache comes back as this; other kinds go to the real cache.
    // This relies on no earlier test file having loaded a second copy of render-cache into the module registry.
    mock.module("../src/lib/render-cache", () => ({
      ...original,
      readCache: (kind: string, source: string, parts: string[]) => {
        if (kind !== "notes") return original.readCache(kind, source, parts)
        reads.push(parts)
        if (!parts.some((p) => p.includes("CACHE-ME"))) return undefined
        return Buffer.from(JSON.stringify({ html: "<p>from the cache</p>", headings: [], text: "cached text", words: 3, description: "cached" }))
      },
    }))
  })

  afterAll(() => {
    mock.module("../src/lib/render-cache", () => original)
    site.vault = saved.vault
    // Back to the fixture vault's version: what was rendered from it before stays valid.
    g.__vaultVersion = saved.version
    fs.rmSync(vault, { recursive: true, force: true })
  })

  test("fenced blocks of a plugin's language render through it, errors shown in place", async () => {
    const md = ["```greet title=x", "you", "```", "", "```Later", "soon", "```", "", "```boom", "x", "```", "", "```js", "plain()", "```"].join("\n")
    const html = await renderMarkdown(md, "vi-VN", "Some/Key")
    expect(html).toContain('<p class="greet">you|vi-VN|Some/Key|title=x</p>')
    expect(html).toContain('<p class="later">soon</p>')
    expect(html).toContain('<p class="dataview dv-error">boom: no &#x3C;way></p>')
    // A language no plugin renders stays code.
    expect(html).toContain("plain")
    expect(html).toContain("language-js")
  })

  test("the plugins' head tags are added", async () => {
    expect(await userHead()).toBe('<meta name="cov" content="on">\n')
  })

  test("a note found in the disk cache is reused as it is, its image placeholders kept", async () => {
    const note = getVault().byKey["vi-VN"].get("Cached")!
    expect(note.assets).toEqual(["img/wide.png"])
    const before = renderCache.cacheStats().reused + renderCache.cacheStats().reusedWithDeps
    const r = await renderNote(note)
    expect(r.html).toBe("<p>from the cache</p>")
    expect(r.text).toBe("cached text")
    expect(r.words).toBe(3)
    expect(r.description).toBe("cached")
    expect(renderCache.cacheStats().reused + renderCache.cacheStats().reusedWithDeps).toBe(before + 1)
    // The key holds the markdown and the stamp of the image.
    const key = reads.at(-1)!
    expect(key).toContain(note.md)
    expect(key.some((p) => p.startsWith("img/wide.png@"))).toBe(true)
  })

  test("a typst block reading files keeps its note out of the disk cache", async () => {
    const vi = getVault().byKey["vi-VN"]
    const count = reads.length
    await renderNote(vi.get("Typst")!)
    expect(reads.length).toBe(count)
    // Typst that reads nothing is cached like any note.
    await renderNote(vi.get("Plain typst")!)
    expect(reads.length).toBe(count + 1)
  }, 60_000)

  test("ids inside an embed are scoped, and links out of it go to the source note", async () => {
    const html = await renderMarkdown('<span class="transclude-ph" data-key="Foot" data-fragment=""></span>', "vi-VN", "x")
    expect(html).toContain('aria-describedby="embed-1-footnote-label"')
    expect(html).toContain('id="embed-1-footnote-label"')
    expect(html).toContain('href="#embed-1-user-content-fn-1"')
    expect(html).toContain('href="/Foot#tail"')
    // Markdown percent-encodes the stray "%", so the fragment reaches the source note intact.
    expect(html).toContain('href="/Foot#%E0%A4%25A"')
  })
})
