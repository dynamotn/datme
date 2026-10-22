import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const notebook = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/notebook.css"), "utf8")

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`)
  expect(at).toBeGreaterThanOrEqual(0)
  return css.slice(at, css.indexOf("}", at))
}

describe("notebook look", () => {
  test("a heading strip keeps a line of its own, even right after another heading", () => {
    const h2 = rule(notebook, '[data-look="notebook"] .prose h2')
    expect(h2).not.toMatch(/display:\s*inline/)
    expect(h2).toMatch(/width:\s*fit-content/)
  })
})

/** Every selector of a look's stylesheet starts with that look's own `[data-look=…]`. */
function expectScoped(file: string, look: string) {
  const css = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  const selectors = [...css.matchAll(/([^{};]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((s) => !s.startsWith("@") && !/^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(s))
  expect(selectors.length).toBeGreaterThan(0)
  for (const list of selectors) for (const one of list.split(",")) expect(one.trim()).toStartWith(`[data-look="${look}"]`)
}

describe("garden look", () => {
  test("every rule is scoped to the garden look", () => {
    expectScoped("garden.css", "garden")
  })
})

describe("resume look", () => {
  test("every rule is scoped to the resume look", () => {
    expectScoped("resume.css", "resume")
  })

  test("a résumé prints on white paper, even from dark mode", () => {
    const print = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/print.css"), "utf8")
    expect(print).toContain('[data-look="resume"][data-theme="dark"]')
  })
})

describe("darkroom look", () => {
  test("every rule is scoped to the darkroom look", () => {
    expectScoped("darkroom.css", "darkroom")
  })
})

describe("terminal look", () => {
  const css = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/terminal.css"), "utf8")

  test("every rule is scoped to the terminal look", () => {
    expectScoped("terminal.css", "terminal")
  })

  test("the cursor blinks only for readers who allow motion", () => {
    const blink = css.indexOf("animation: terminal-blink")
    expect(blink).toBeGreaterThan(0)
    expect(css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", blink)).toBeGreaterThan(css.lastIndexOf("}\n}", blink))
  })

  test("the reader's legible font replaces the monospace everywhere", () => {
    expect(rule(css, '[data-look="terminal"].font-legible')).toContain('--term: "Atkinson Hyperlegible"')
    for (const v of ["--font-ui", "--font-read", "--font-heading"]) expect(rule(css, '[data-look="terminal"]')).toContain(`${v}: var(--term)`)
  })

  test("prompts are decoration that screen readers skip", () => {
    for (const m of css.matchAll(/content: "([^"]+)";\n\s*content: (.+);/g)) expect(m[2]).toBe(`"${m[1]}" / ""`)
    expect(css).toContain('content: "$ " / "";')
  })

  test("it prints on white paper, without its scanlines or cursor", () => {
    const print = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/print.css"), "utf8")
    expect(print).toContain('[data-look="terminal"][data-theme="dark"]')
    expect(css.slice(css.indexOf("@media print"))).toContain(".note-title::after")
  })
})

describe("blueprint look", () => {
  const css = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/blueprint.css"), "utf8")

  test("every rule is scoped to the blueprint look", () => {
    expectScoped("blueprint.css", "blueprint")
  })

  test("each kind of diagram sits on a numbered sheet with a title block", () => {
    for (const sheet of ["pre.mermaid", "figure.diagram-d2", ".drawing.generated"]) {
      expect(rule(css, `[data-look="blueprint"] .prose ${sheet}::after`)).toContain("counter(blueprint-sheet, decimal-leading-zero)")
    }
    for (const kind of ["MERMAID", "D2", "EXCALIDRAW"]) expect(css).toContain(`  ·  ${kind}  ·  SCALE NTS" / ""`)
    expect(css).toContain("counter-increment: blueprint-sheet")
  })

  test("its lettering is decoration that screen readers skip", () => {
    for (const m of css.matchAll(/content: ([^;]+);\n\s*content: (.+);/g)) expect(m[2]).toBe(`${m[1]} / ""`)
  })

  test("it prints on white paper, without its grid", () => {
    const print = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/print.css"), "utf8")
    expect(print).toContain('[data-look="blueprint"][data-theme="dark"]')
    expect(css.slice(css.indexOf("@media print"))).toContain("background: #fff")
  })
})

describe("wiki look", () => {
  const css = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/wiki.css"), "utf8")

  test("every rule is scoped to the wiki look", () => {
    expectScoped("wiki.css", "wiki")
  })

  test("the infobox floats beside the text, and stacks above it on a phone", () => {
    expect(rule(css, '[data-look="wiki"] .infobox')).toContain("float: right")
    const phone = css.slice(css.indexOf("@media (max-width: 640px)"))
    expect(rule(phone, '[data-look="wiki"] .infobox')).toContain("float: none")
  })

  test("the rail's contents give way to the box at the top", () => {
    expect(rule(css, '[data-look="wiki"] .sidebar-right .toc')).toContain("display: none")
  })
})

describe("broadsheet look", () => {
  const css = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/broadsheet.css"), "utf8")
  const story = '[data-look="broadsheet"] .note:not([class*="layout-"]):not(.is-wide) > .prose'

  test("every rule is scoped to the broadsheet look", () => {
    expectScoped("broadsheet.css", "broadsheet")
  })

  test("a story runs in two columns only where both fit, and opens on a drop cap", () => {
    // A column count with a width: one column on a phone, two where each gets 19em.
    expect(rule(css, story)).toContain("columns: 2 19em")
    expect(rule(css, `${story} > p:first-of-type::first-letter`)).toContain("float: left")
  })

  test("a stream's newest note runs across the top of its columns", () => {
    expect(rule(css, '[data-look="broadsheet"] .stream')).toContain("columns: 3 17rem")
    expect(rule(css, '[data-look="broadsheet"] .stream-item:first-child')).toContain("column-span: all")
  })
})

describe("herbarium, manuscript and lacquer looks", () => {
  const css = (file: string) => fs.readFileSync(path.resolve(import.meta.dir, "../src/styles", file), "utf8")

  for (const look of ["herbarium", "manuscript", "lacquer"]) {
    test(`every rule is scoped to the ${look} look`, () => {
      expectScoped(`${look}.css`, look)
    })
  }

  test("each prints black on white, even from dark mode", () => {
    const print = css("print.css")
    for (const look of ["herbarium", "manuscript", "lacquer"]) expect(print).toContain(`[data-look="${look}"][data-theme="dark"]`)
    // The sheet's tape and frame stay on screen.
    expect(print).toContain('[data-look="herbarium"] article.note::before')
  })

  test("a herbarium sheet stops moving for readers who ask for less motion", () => {
    expect(css("herbarium.css")).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\[data-look="herbarium"\] \.garden-tile \{\s*transition: none;/)
  })

  test("a manuscript puts its sidenotes in the margin whenever its text has room, not only in reader mode", () => {
    const manuscript = css("manuscript.css")
    expect(manuscript).toContain("container: manuscript / inline-size")
    const query = manuscript.slice(manuscript.indexOf("@container manuscript"))
    expect(query).toMatch(/\.sidenote \{\s*display: block;/)
    expect(query).toContain(".footnotes {\n    display: none;")
  })
})

describe("zine, atlas and catalog looks", () => {
  const css = (file: string) => fs.readFileSync(path.resolve(import.meta.dir, "../src/styles", file), "utf8")

  for (const look of ["zine", "atlas", "catalog"]) {
    test(`every rule is scoped to the ${look} look`, () => {
      expectScoped(`${look}.css`, look)
    })
  }

  test("each prints black on white, even from dark mode", () => {
    const print = css("print.css")
    for (const look of ["zine", "atlas", "catalog"]) expect(print).toContain(`[data-look="${look}"][data-theme="dark"]`)
    // A zine prints straight and without its tape; a card without its hole.
    expect(print).toMatch(/\[data-look="zine"\]\[data-theme="dark"\] \{\s*--tilt: 0;/)
    expect(print).toContain('[data-look="zine"] .prose blockquote::before')
    expect(print).toContain('[data-look="catalog"] article.note::after {\n    display: none;')
  })

  test("a zine tilts its blocks by --tilt alone, which a phone sets to 0", () => {
    const zine = css("zine.css")
    const rotations = [...zine.matchAll(/rotate: ([^;]+);/g)].map((m) => m[1])
    expect(rotations.length).toBeGreaterThan(5)
    for (const r of rotations) expect(r).toMatch(/^calc\(-?[\d.]+deg \* var\(--tilt\)\)$|^0deg$/)
    expect(zine).toMatch(/@media \(max-width: 640px\) \{\s*\[data-look="zine"\] \{\s*--tilt: 0;/)
  })

  test("a zine's cards and a catalogue's drawers stop moving for readers who ask for less motion", () => {
    expect(css("zine.css")).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-look="zine"\] \.backlink,\s*\[data-look="zine"\] \.folder-card \{\s*transition: none;/)
    expect(css("catalog.css")).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-look="catalog"\] \.folder-card \{\s*transition: none;/)
  })

  test("an atlas draws the graph's links as dotted roads, on land in a sea", () => {
    const atlas = css("atlas.css")
    expect(atlas).toContain("--graph-dash: 3 3;")
    expect(atlas).toMatch(/\[data-look="atlas"\] \.graph-box,[^{]*\{[^}]*var\(--land\)[^}]*var\(--sea\)/)
  })
})

describe("seasonal garden", () => {
  const garden = fs.readFileSync(path.resolve(import.meta.dir, "../src/styles/garden.css"), "utf8")
  test("every season has a palette in each scheme, as weak as the look's own", () => {
    for (const season of ["spring", "summer", "autumn", "winter"]) {
      expect(garden).toContain(`[data-look="garden"]:where([data-season="${season}"]) {`)
      expect(garden).toContain(`[data-look="garden"][data-theme="dark"]:where([data-season="${season}"]) {`)
    }
  })
})

describe("the monospace font", () => {
  const css = (file: string) => fs.readFileSync(path.resolve(import.meta.dir, "../src/styles", file), "utf8")
  test("falls back to local faces sized to Iosevka's metrics, right after it in both looks", () => {
    const global = css("global.css")
    const faces = [...global.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]).filter((f) => f.includes("Iosevka Dynamo Fallback"))
    expect(faces).toHaveLength(2)
    const pct = (face: string, d: string) => Number(face.match(new RegExp(`${d}:\\s*([\\d.]+)%`))![1]) / 100
    expect(faces.every((f) => /src:\s*local\(/.test(f) && pct(f, "line-gap-override") === 0)).toBe(true)
    // Half an em wide: each local face's advance (Consolas 1126, Menlo 1233 of 2048) times its adjustment.
    const [consolas, menlo] = faces
    expect(pct(consolas, "size-adjust") * (1126 / 2048)).toBeCloseTo(0.5, 3)
    expect(pct(menlo, "size-adjust") * (1233 / 2048)).toBeCloseTo(0.5, 3)
    // 0.965em above the baseline and 0.285em below, once adjusted.
    for (const face of faces) {
      expect(pct(face, "ascent-override") * pct(face, "size-adjust")).toBeCloseTo(0.965, 3)
      expect(pct(face, "descent-override") * pct(face, "size-adjust")).toBeCloseTo(0.285, 3)
    }
    const stack = '"Iosevka Dynamo", "Iosevka Dynamo Fallback Consolas", "Iosevka Dynamo Fallback", ui-monospace, monospace'
    expect(global).toContain(`--font-code: ${stack};`)
    expect(css("notebook.css")).toContain(`--font-mono: ${stack};`)
  })
})
