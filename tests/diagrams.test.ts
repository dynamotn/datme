import { describe, expect, test } from "bun:test"
import path from "node:path"
import { renderMarkdown } from "../src/lib/markdown"
import { markmapTree } from "../src/lib/diagrams"

const render = (md: string) => renderMarkdown(md, "en-US", "x")

/** Render notes in a fresh process, free of the DOM globals other test files register. */
function renderInProcess(notes: string[]): string[] {
  const script = `import { renderMarkdown } from ${JSON.stringify(path.resolve(import.meta.dir, "../src/lib/markdown.ts"))}
const notes = ${JSON.stringify(notes)}
const out = await Promise.all(notes.map((n) => renderMarkdown(n, "en-US", "x")))
console.log(JSON.stringify(out))`
  // No process.exit: like datme build, the process must end on its own once the diagrams are drawn.
  const proc = Bun.spawnSync(["bun", "--preload", path.resolve(import.meta.dir, "setup.ts"), "-e", script], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  })
  if (proc.exitCode !== 0) throw new Error(proc.signalCode ? `killed by ${proc.signalCode}: the process did not end` : proc.stderr.toString())
  return JSON.parse(proc.stdout.toString().trim().split("\n").at(-1)!)
}

describe("diagrams", () => {
  // D2 picks its worker by `typeof window`, which the DOM of other test files sets: it runs in a process of its own.
  test("D2 is drawn at build time, with its dark colours under the site's theme switch; mistakes are explained", () => {
    const [ok, bad, twice] = renderInProcess(["```d2\nidea -> note: grows into\n```", "```d2\na ->\n```", "```d2\nx -> y\n```\n\n```d2\np -> q\n```"])
    expect(ok).toContain('<figure class="diagram diagram-d2"><svg')
    expect(ok).toContain("grows into")
    expect(ok).toContain(':root[data-theme="dark"]{')
    expect(ok).not.toContain("prefers-color-scheme")
    expect(ok).not.toContain("<?xml")
    expect(bad).toBe('<p class="dataview dv-error">D2: index:1:1: connection missing destination</p>')
    // Two diagrams of one note are drawn one after the other, each with its own source.
    const [first, second] = twice.split("</figure>")
    expect(first).toContain(">x</text>")
    expect(second).toContain(">p</text>")
    expect(second).not.toContain(">x</text>")
  }, 120_000)

  test("Typst is typeset at build time in the page's ink and size", async () => {
    const html = await render("```typst\n$ sum_(i=1)^n i $\n```")
    expect(html).toContain('<figure class="diagram diagram-typst"><svg')
    expect(html).toContain('fill="currentColor"')
    expect(html).not.toMatch(/(fill|stroke)="#000"/)
    expect(await render("```typst\n#foo(\n```")).toBe('<p class="dataview dv-error">Typst: unclosed delimiter</p>')
  }, 60_000)

  test("sheet music keeps its source for the browser to typeset", async () => {
    const html = await render("```abc\nX:1\nK:C\nCDEF|GABc|\n```")
    expect(html).toBe('<pre class="abc" role="img" aria-label="Sheet music">X:1\nK:C\nCDEF|GABc|</pre>')
  })

  test("a mind map ships its tree, with an outline for readers without the drawing", async () => {
    expect(await markmapTree("# Garden\n## Seeds\n- idea\n## Trees")).toEqual({
      content: "Garden",
      children: [
        { content: "Seeds", children: [{ content: "idea", children: [] }] },
        { content: "Trees", children: [] },
      ],
    })
    for (const lang of ["markmap", "mindmap"]) {
      const html = await render("```" + lang + "\n# Garden\n## Seeds & *roots*\n```")
      expect(html).toStartWith('<figure class="markmap" data-markmap="')
      expect(html).toContain('<ul class="markmap-outline"><li>Garden<ul><li>Seeds &#x26; roots</li></ul></li></ul>')
    }
  })
})
