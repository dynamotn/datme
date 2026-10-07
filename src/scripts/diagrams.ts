/**
 * Diagrams drawn in the browser: sheet music (```abc) with abcjs, and mind
 * maps (```markmap) with markmap. Each library is fetched only on a page that
 * has one of its blocks.
 */

/** ```abc blocks, typeset into SVG in place of their source. */
export async function renderAbc(root: ParentNode = document) {
  const blocks = [...root.querySelectorAll<HTMLElement>(".prose pre.abc:not([data-drawn])")]
  if (!blocks.length) return
  const { default: abcjs } = await import("abcjs")
  for (const pre of blocks) {
    const src = pre.textContent ?? ""
    const out = document.createElement("div")
    out.className = "abc-score"
    out.setAttribute("role", "img")
    out.setAttribute("aria-label", pre.getAttribute("aria-label") ?? "Sheet music")
    // The source stays for copying and paper; the score is drawn after it and shown instead.
    pre.dataset.drawn = ""
    pre.after(out)
    abcjs.renderAbc(out, src, { responsive: "resize", foregroundColor: "currentColor", add_classes: true })
  }
}

interface MarkmapNode {
  content: string
  children: MarkmapNode[]
}

const maps = new Map<SVGSVGElement, { destroy(): void }>()

/** ```markmap blocks: the outline built at build time, drawn as an interactive mind map. */
export async function renderMarkmaps(root: ParentNode = document) {
  const figs = [...root.querySelectorAll<HTMLElement>(".prose figure.markmap:not([data-drawn])")]
  if (!figs.length) return
  const { Markmap } = await import("markmap-view")
  for (const fig of figs) {
    const svg = fig.querySelector("svg")
    if (!svg) continue
    fig.dataset.drawn = ""
    const data = JSON.parse(fig.dataset.markmap!) as MarkmapNode
    const mm = Markmap.create(svg, { autoFit: true, duration: 300, fitRatio: 0.92 }, data)
    maps.set(svg, mm)
  }
}

/** Markmap watches its SVG for resizing; let go of the maps of the page being left. */
export function teardownMarkmaps() {
  for (const mm of maps.values()) mm.destroy()
  maps.clear()
}
