import { describe, expect, mock, spyOn, test } from "bun:test"
import { renderD2, setOptionalImport } from "../src/lib/diagrams"
import { renderMarkdown } from "../src/lib/markdown"
import { site } from "../src/site.config"

/*
 * D2 draws in a worker thread of its WASM build, which a test process cannot
 * share with the DOM other test files install (see tests/diagrams.test.ts):
 * here a fake engine stands in for it, so the code around it runs in-process.
 * The mock holds for the whole test process; no other in-process test draws D2.
 */
type Compiled = { diagram: unknown; renderOptions: Record<string, unknown> }
interface Engine {
  ready: Promise<void>
  worker?: { ref?(): void; unref?(): void }
  compile(source: string): Promise<Compiled>
  render(diagram: unknown, options: Record<string, unknown>): Promise<string>
}

const log: string[] = []
const rendered: { diagram: unknown; options: Record<string, unknown> }[] = []
let compile: (source: string) => Promise<Compiled> = async (source) => ({ diagram: source, renderOptions: {} })
let svg = (diagram: unknown) =>
  `<svg class="d2" viewBox="0 0 120.5 40"><style>@media screen and (prefers-color-scheme:dark){.a{fill:#fff}}</style><text>${String(diagram)}</text></svg>`
let engine: Engine | undefined

mock.module("@terrastruct/d2", () => ({
  D2: class implements Engine {
    ready = Promise.resolve()
    worker: Engine["worker"] = { ref: () => void log.push("ref"), unref: () => void log.push("unref") }
    constructor() {
      engine = this
    }
    compile(source: string) {
      log.push(`compile ${source}`)
      return compile(source)
    }
    async render(diagram: unknown, options: Record<string, unknown>) {
      rendered.push({ diagram, options })
      return svg(diagram)
    }
  },
}))

const fail = (e: unknown) => async (): Promise<Compiled> => {
  throw e
}

describe("D2 drawn in-process", () => {
  test("the SVG keeps its drawn size and moves its dark colours under the site's theme switch", async () => {
    const out = await renderD2("a -> b")
    expect(out).toBe(
      '<svg class="d2" viewBox="0 0 120.5 40" width="120.5" height="40"><style>:root[data-theme="dark"]{.a{fill:#fff}}</style><text>a -> b</text></svg>',
    )
    expect(rendered.at(-1)!.options).toEqual({ themeID: site.theme.d2.light, darkThemeID: site.theme.d2.dark, pad: 16, noXMLTag: true })
    // The worker only keeps the process alive while it draws.
    expect(log).toEqual(["ref", "compile a -> b", "unref"])
  })

  test("themes a diagram sets in its vars win over the configured ones", async () => {
    compile = async (source) => ({ diagram: source, renderOptions: { themeID: 4, darkThemeID: 201, sketch: true } })
    await renderD2("x")
    expect(rendered.at(-1)!.options).toEqual({ themeID: 4, darkThemeID: 201, sketch: true, pad: 16, noXMLTag: true })
  })

  test("an SVG without a viewBox is left as drawn", async () => {
    compile = async (source) => ({ diagram: source, renderOptions: {} })
    svg = () => "<svg><g/></svg>"
    expect(await renderD2("y")).toBe("<svg><g/></svg>")
  })

  test("D2's list of mistakes becomes one message", async () => {
    compile = fail(new Error(JSON.stringify([{ errmsg: "1:1: bad" }, {}, { errmsg: "2:3: worse" }])))
    await expect(renderD2("bad")).rejects.toThrow("1:1: bad; 2:3: worse")
  })

  test("a list without any message, JSON that is not a list, or plain text is reported as it came", async () => {
    compile = fail(new Error("[{}]"))
    await expect(renderD2("a")).rejects.toThrow("[{}]")
    compile = fail(new Error('{"errmsg":"x"}'))
    await expect(renderD2("b")).rejects.toThrow('{"errmsg":"x"}')
    compile = fail("worker gone")
    await expect(renderD2("c")).rejects.toThrow("worker gone")
    compile = fail(new Error("not json"))
    await expect(renderD2("d")).rejects.toThrow("not json")
  })

  test("the worker is let go even when a diagram fails, and an engine without a worker draws too", async () => {
    log.length = 0
    compile = fail(new Error("oops"))
    await expect(renderD2("z")).rejects.toThrow("oops")
    expect(log).toEqual(["ref", "compile z", "unref"])
    const worker = engine!.worker
    engine!.worker = {}
    compile = async (source) => ({ diagram: source, renderOptions: {} })
    expect(await renderD2("w")).toBe("<svg><g/></svg>")
    engine!.worker = undefined
    expect(await renderD2("v")).toBe("<svg><g/></svg>")
    engine!.worker = worker
  })

  test("diagrams are drawn one after the other, and a failed one does not stop the next", async () => {
    log.length = 0
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    compile = async (source) => {
      if (source === "first") {
        await gate
        throw new Error("first failed")
      }
      return { diagram: source, renderOptions: {} }
    }
    svg = (d) => `<svg>${String(d)}</svg>`
    const first = renderD2("first")
    const second = renderD2("second")
    await Bun.sleep(5)
    // The second waits for the first to be done.
    expect(log).toEqual(["ref", "compile first"])
    release()
    await expect(first).rejects.toThrow("first failed")
    expect(await second).toBe("<svg>second</svg>")
    expect(log).toEqual(["ref", "compile first", "unref", "ref", "compile second", "unref"])
  })

  test("in a note, a drawing is wrapped in a figure, and a mistake is explained in place", async () => {
    compile = async (source) => ({ diagram: source.trim(), renderOptions: {} })
    svg = (d) => `<svg>${String(d)}</svg>`
    expect(await renderMarkdown("```d2\ncov-ok\n```", "en-US", "x")).toBe('<figure class="diagram diagram-d2"><svg>cov-ok</svg></figure>')
    compile = fail(new Error(JSON.stringify([{ errmsg: "1:4: <nope>" }])))
    expect(await renderMarkdown("```D2\ncov-bad\n```", "en-US", "x")).toBe('<p class="dataview dv-error">D2: 1:4: &#x3C;nope></p>')
  })
})

describe("mind maps", () => {
  test("a mind map that cannot be parsed is explained in place", async () => {
    const { Transformer } = await import("markmap-lib")
    const broken = spyOn(Transformer.prototype, "transform").mockImplementation(() => {
      throw new Error("cannot parse <this>")
    })
    try {
      expect(await renderMarkdown("```markmap\n# cov-broken\n```", "en-US", "x")).toBe('<p class="dataview dv-error">Mind map: cannot parse &#x3C;this></p>')
    } finally {
      broken.mockRestore()
    }
  })
})

describe("renderers that are not installed", () => {
  test("one that is installed but fails to load says why, instead of asking to install it", async () => {
    setOptionalImport(async () => {
      throw Object.assign(new Error("dlopen: incompatible architecture"), { code: "ERR_DLOPEN_FAILED" })
    })
    try {
      const html = await renderMarkdown("```d2\ncov-broken -> load\n```", "en-US", "x")
      expect(html).toContain("@terrastruct/d2 is installed but could not be loaded: dlopen: incompatible architecture")
      expect(html).not.toContain("install it next to datme")
    } finally {
      setOptionalImport(undefined)
    }
  })

  test("a module that is not found, by code or by message, counts as not installed", async () => {
    setOptionalImport(async () => {
      throw Object.assign(new Error("no such thing"), { code: "ERR_MODULE_NOT_FOUND" })
    })
    try {
      expect(await renderMarkdown("```typst\ncov-notfound\n```", "en-US", "x")).toContain("install it next to datme")
    } finally {
      setOptionalImport(undefined)
    }
  })

  test("a block shows its source and how to install what draws it; restoring the importer draws again", async () => {
    const asked: string[] = []
    setOptionalImport(async (name) => {
      asked.push(name)
      throw new Error(`Cannot find package '${name}'`)
    })
    try {
      const d2 = await renderMarkdown("```d2\ncov-missing <a>\n```", "en-US", "x")
      expect(d2).toStartWith(
        '<div class="diagram-missing"><p class="dataview dv-error">D2 needs @terrastruct/d2: install it next to datme (bun add @terrastruct/d2).</p><pre',
      )
      // The source stays readable, escaped, as a code block.
      expect(d2).toContain("cov-missing &#x3C;a>")
      expect(await renderMarkdown("```typst\ncov-missing typst\n```", "en-US", "x")).toContain(
        "Typst needs @myriaddreamin/typst-ts-node-compiler: install it next to datme",
      )
      expect(asked).toEqual(["@terrastruct/d2", "@myriaddreamin/typst-ts-node-compiler"])
    } finally {
      setOptionalImport(undefined)
    }
    compile = async (source) => ({ diagram: source, renderOptions: {} })
    svg = (d) => `<svg>${String(d)}</svg>`
    expect(await renderD2("back")).toBe("<svg>back</svg>")
  })
})
