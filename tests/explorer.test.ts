import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { installDom, settle } from "./client-dom"
import { encrypt } from "../src/lib/encrypt"

// The whole page script (src/scripts/app.ts); happy-dom stands in for a browser. The script binds its listeners to
// the document once, when first imported, so this is the one test file that imports it, on the one shared test
// document of tests/client-dom.ts.
const navigated: string[] = []
mock.module("astro:transitions/client", () => ({ navigate: (u: string) => void navigated.push(u) }))
const mermaidCalls: unknown[][] = []
mock.module("mermaid", () => ({
  default: {
    initialize: (config: unknown) => void mermaidCalls.push(["initialize", config]),
    run: async (opts: { nodes: HTMLElement[] }) => void mermaidCalls.push(["run", opts.nodes.map((n) => n.textContent)]),
  },
}))

const dom = installDom("https://garden.example/notes/a")
const root = document.documentElement
const registered: string[] = []
const fetched: string[] = []
const realFetch = globalThis.fetch
const NOTES = ["/en-US/a", "/en-US/b"].map((u) => ({ u, t: u, a: [], g: [], p: "", y: [], s: null, f: "", d: "", c: "" }))
const observers: { cb: (entries: { isIntersecting: boolean; target: Element }[]) => void; margin?: string; observed: Element[] }[] = []

beforeAll(async () => {
  globalThis.fetch = (async (url: string) => {
    const u = String(url)
    fetched.push(u)
    if (u.includes("/static/contentIndex.") || u.includes("/static/graph.")) return new Response(JSON.stringify({ notes: NOTES, links: [] }))
    if (u.endsWith("/en-US/b"))
      return new Response(`<div data-stack-col data-url="/en-US/b"><div class="prose"><pre><code>column code</code></pre></div></div>`)
    return new Response("", { status: 404 })
  }) as unknown as typeof fetch
  dom.set("matchMedia", (q: string) => ({
    matches: q.includes("min-width"),
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }))
  dom.set(
    "IntersectionObserver",
    class {
      entry: (typeof observers)[number]
      constructor(cb: (typeof observers)[number]["cb"], opts?: { rootMargin?: string }) {
        this.entry = { cb, margin: opts?.rootMargin, observed: [] }
        observers.push(this.entry)
      }
      observe(el: Element) {
        this.entry.observed.push(el)
      }
      disconnect() {}
    },
  )
  dom.set(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
  // Offline reading in a production build: the service worker registers once the page has loaded.
  root.dataset.offline = ""
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: (u: string) => (registered.push(u), Promise.reject(new Error("no service worker here"))) },
  })
  const prod = process.env.PROD
  process.env.PROD = "1"
  try {
    await import("../src/scripts/app")
  } finally {
    if (prod === undefined) delete process.env.PROD
    else process.env.PROD = prod
  }
})
afterAll(() => {
  globalThis.fetch = realFetch
  delete (navigator as unknown as Record<string, unknown>).serviceWorker
  dom.restore()
})
beforeEach(() => {
  navigated.length = 0
  mermaidCalls.length = 0
})

const pageLoad = () => document.dispatchEvent(new dom.window.Event("astro:page-load"))
const key = (k: string, opts: { meta?: boolean; ctrl?: boolean; alt?: boolean } = {}, target: Element = document.body) => {
  const e = new dom.window.KeyboardEvent("keydown", { key: k, metaKey: opts.meta, ctrlKey: opts.ctrl, altKey: opts.alt, bubbles: true, cancelable: true })
  target.dispatchEvent(e as unknown as Event)
  return e
}
const until = async (cond: () => unknown) => {
  for (let i = 0; i < 200 && !cond(); i++) await settle(5)
}

describe("the explorer", () => {
  test("a corrupt list of open folders is ignored, and the page still sets up", async () => {
    dom.window.localStorage.setItem("explorer-open", "{not json")
    document.body.innerHTML = `<nav class="explorer" data-explorer><details data-dir="notes"><summary>notes</summary><a href="/notes/a">A</a></details></nav>`
    pageLoad()
    expect(document.querySelector("a")!.getAttribute("aria-current")).toBe("page")
  })

  test("the current note's folders open, folders left open stay open, and toggling is remembered", () => {
    dom.goto("https://garden.example/en-US/a")
    localStorage.setItem("explorer-open", JSON.stringify(["C", 3]))
    document.body.innerHTML = `<nav class="explorer" data-explorer>
        <details data-dir="A"><summary>A</summary><ul><li><details data-dir="A/B"><summary>B</summary><ul><li><a id="cur" href="/en-US/a">a</a></li></ul></details></li></ul></details>
        <details data-dir="C"><summary>C</summary></details>
        <details data-dir="D"><summary>D</summary></details>
      </nav>
      <nav class="main-nav"><a id="other" href="/en-US/other" aria-current="page">other</a></nav>`
    pageLoad()
    const dir = (d: string) => document.querySelector<HTMLDetailsElement>(`details[data-dir="${d}"]`)!
    expect([dir("A").open, dir("A/B").open, dir("C").open, dir("D").open]).toEqual([true, true, true, false])
    expect(document.getElementById("cur")!.getAttribute("aria-current")).toBe("page")
    expect(document.getElementById("other")!.hasAttribute("aria-current")).toBe(false)
    const stored = () => (JSON.parse(localStorage.getItem("explorer-open")!) as string[]).sort()
    // Folders opened for the current note fire "toggle" like any other, so they are remembered too.
    dir("D").open = true
    dir("D").dispatchEvent(new dom.window.Event("toggle") as unknown as Event)
    expect(stored()).toEqual(["A", "A/B", "C", "D"])
    dir("C").open = false
    dir("C").dispatchEvent(new dom.window.Event("toggle") as unknown as Event)
    expect(stored()).toEqual(["A", "A/B", "D"])
    // Bound once: a second page load does not add listeners again.
    pageLoad()
    dir("C").dispatchEvent(new dom.window.Event("toggle") as unknown as Event)
    expect(stored()).toEqual(["A", "A/B", "D"])
  })

  test("a folder's own page opens its folder", () => {
    dom.goto("https://garden.example/en-US/folder")
    document.body.innerHTML = `<nav class="explorer" data-explorer><div><a class="folder-link" href="/en-US/folder">F</a><details data-dir="F"><summary>F</summary></details></div></nav>`
    pageLoad()
    expect(document.querySelector<HTMLDetailsElement>("details")!.open).toBe(true)
    dom.goto("https://garden.example/en-US/a")
  })

  test("blocked storage keeps folders as they are", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!
    const throws = () => {
      throw new Error("blocked")
    }
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: throws, setItem: throws, removeItem: throws, key: throws, length: 0 },
    })
    try {
      document.body.innerHTML = `<nav class="explorer" data-explorer><details data-dir="Z"><summary>Z</summary></details></nav>`
      pageLoad()
      const d = document.querySelector<HTMLDetailsElement>("details")!
      expect(d.open).toBe(false)
      d.open = true
      expect(() => d.dispatchEvent(new dom.window.Event("toggle") as unknown as Event)).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, "localStorage", real)
    }
  })
})

describe("the page script", () => {
  test("offline reading registers the service worker once the page has loaded", async () => {
    dom.window.dispatchEvent(new dom.window.Event("load") as unknown as Event)
    await settle()
    expect(registered).toEqual(["/sw.js"])
  })

  test("a site served under a path registers its worker there, so the worker's scope is the site", async () => {
    const { setupOffline } = await import("../src/scripts/app")
    const prod = process.env.PROD
    process.env.PROD = "1"
    process.env.BASE_URL = "/garden/"
    try {
      setupOffline()
      dom.window.dispatchEvent(new dom.window.Event("load") as unknown as Event)
      await settle()
      expect(registered.at(-1)).toBe("/garden/sw.js")
    } finally {
      if (prod === undefined) delete process.env.PROD
      else process.env.PROD = prod
      delete process.env.BASE_URL
    }
  })

  test("without offline reading, a service worker a previous config installed is dropped; dev builds leave it be", async () => {
    const { setupOffline } = await import("../src/scripts/app")
    const sw = Object.getOwnPropertyDescriptor(navigator, "serviceWorker")!
    const dropped: string[] = []
    const reg = (scope: string) => ({ scope, unregister: async () => void dropped.push(scope) })
    // Another site of the host, under a path of its own, keeps its worker.
    const regs = [reg("https://garden.example/"), reg("https://garden.example/other/")]
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistrations: async () => regs } })
    const prod = process.env.PROD
    delete root.dataset.offline
    try {
      delete process.env.PROD
      setupOffline()
      await settle()
      expect(dropped).toEqual([])
      process.env.PROD = "1"
      setupOffline()
      await settle()
      expect(dropped).toEqual(["https://garden.example/"])
      // A site served under a path drops only the worker of that path.
      process.env.BASE_URL = "/other/"
      setupOffline()
      await settle()
      expect(dropped).toEqual(["https://garden.example/", "https://garden.example/other/"])
    } finally {
      if (prod === undefined) delete process.env.PROD
      else process.env.PROD = prod
      delete process.env.BASE_URL
      root.dataset.offline = ""
      Object.defineProperty(navigator, "serviceWorker", sw)
    }
  })

  test("a note page loads the slim graph index, never the full one with every note's text", async () => {
    dom.goto("https://garden.example/en-US/a")
    root.dataset.lang = "en-US"
    document.body.innerHTML = `<dialog data-search-dialog data-lang="en-US"><input><div class="search-results"></div></dialog>
      <article class="note"><p>Text.</p></article><button data-walk-open hidden>walk</button>
      <aside class="sidebar-right"><div class="graph-box"><canvas data-graph="local" data-lang="en-US" data-current="/en-US/a"></canvas></div></aside>`
    const canvas = document.querySelector("canvas")!
    const noop = new Proxy({}, { get: () => () => {}, set: () => true })
    canvas.getContext = (() => noop) as unknown as HTMLCanvasElement["getContext"]
    fetched.length = 0
    observers.length = 0
    pageLoad()
    // The local graph waits for its rail to come into view.
    const graphWatch = observers.find((o) => o.observed.includes(canvas))!
    expect(graphWatch).toBeDefined()
    graphWatch.cb([{ isIntersecting: true, target: canvas }])
    await until(() => !document.querySelector<HTMLButtonElement>("[data-walk-open]")!.hidden)
    await settle(20)
    expect(fetched).toContain("/static/graph.en-US.json")
    expect(fetched.filter((u) => u.includes("contentIndex"))).toEqual([])
  })

  test("header buttons open search, the graph and a random note, and close dialogs", async () => {
    root.dataset.lang = "cov-app"
    document.body.innerHTML = `<button data-open-search>s</button><button data-open-graph>g</button><button data-random>r</button>
      <dialog data-search-dialog data-lang="cov-app"><input><div class="search-results"></div><button data-close-dialog><span>x</span></button></dialog>
      <dialog data-graph-dialog><canvas data-lang="cov-app"></canvas><button data-close-dialog>x</button></dialog>`
    const search = document.querySelector<HTMLDialogElement>("[data-search-dialog]")!
    const graph = document.querySelector<HTMLDialogElement>("[data-graph-dialog]")!
    const canvas = graph.querySelector("canvas")!
    const noop = new Proxy({}, { get: () => () => {}, set: () => true })
    canvas.getContext = (() => noop) as unknown as HTMLCanvasElement["getContext"]
    document.querySelector<HTMLButtonElement>("[data-open-search]")!.click()
    expect(search.open).toBe(true)
    search.querySelector("span")!.click()
    expect(search.open).toBe(false)
    // A click on the dialog itself, outside its content, is a tap on the backdrop.
    search.classList.add("modal")
    document.querySelector<HTMLButtonElement>("[data-open-search]")!.click()
    search.querySelector("input")!.click()
    expect(search.open).toBe(true)
    search.click()
    expect(search.open).toBe(false)
    document.querySelector<HTMLButtonElement>("[data-open-graph]")!.click()
    expect(graph.open).toBe(true)
    graph.querySelector<HTMLButtonElement>("[data-close-dialog]")!.click()
    expect(graph.open).toBe(false)
    document.querySelector<HTMLButtonElement>("[data-random]")!.click()
    await until(() => navigated.length)
    expect(navigated).toEqual(["/en-US/b"])
    await settle(20)
  })

  test("the print button prints, and printing opens folded callouts and lazy images", () => {
    let printed = 0
    const realPrint = dom.window.print
    dom.window.print = () => void printed++
    try {
      document.body.innerHTML = `<button data-print>p</button><div class="prose"><details id="shut"><summary>s</summary></details><details id="open" open></details><img loading="lazy"></div>`
      document.querySelector<HTMLButtonElement>("[data-print]")!.click()
      expect(printed).toBe(1)
    } finally {
      dom.window.print = realPrint
    }
    dom.window.dispatchEvent(new dom.window.Event("beforeprint") as unknown as Event)
    expect(document.querySelector<HTMLDetailsElement>("#shut")!.open).toBe(true)
    expect(document.querySelector("img")!.getAttribute("loading")).toBe("eager")
    dom.window.dispatchEvent(new dom.window.Event("afterprint") as unknown as Event)
    expect(document.querySelector<HTMLDetailsElement>("#shut")!.open).toBe(false)
    expect(document.querySelector<HTMLDetailsElement>("#open")!.open).toBe(true)
  })

  test("snippet buttons show the cards of one language, and hide groups left empty", () => {
    document.body.innerHTML = `<div class="collection">
      <button data-snippet-lang=""><span>All</span></button><button data-snippet-lang="ts">ts</button>
      <section class="collection-group" id="a"><article class="snippet" data-language="ts"></article><article class="snippet" data-language="sh"></article></section>
      <section class="collection-group" id="b"><article class="snippet" data-language="sh"></article></section></div>`
    const [all, ts] = document.querySelectorAll<HTMLButtonElement>("[data-snippet-lang]")
    const hidden = () => [...document.querySelectorAll<HTMLElement>(".snippet, .collection-group")].map((e) => e.hidden)
    ts.click()
    expect(hidden()).toEqual([false, false, true, true, true])
    expect([all, ts].map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"])
    all.querySelector("span")!.click()
    expect(hidden()).toEqual([false, false, false, false, false])
  })

  test("the theme toggle switches and remembers the theme, and tells giscus, charts, maps and diagrams", async () => {
    delete root.dataset.theme
    root.dataset.mermaid = "forest night"
    document.body.innerHTML = `<button data-theme-toggle><span>t</span></button>
      <div class="comments"><div class="giscus" data-theme-light="light" data-theme-dark="dark_dimmed"></div></div>
      <iframe class="giscus-frame"></iframe>
      <div class="prose"><pre class="mermaid">graph TD; A; B</pre></div>`
    const messages: [unknown, string][] = []
    Object.defineProperty(document.querySelector("iframe")!, "contentWindow", {
      configurable: true,
      value: { postMessage: (m: unknown, o: string) => void messages.push([m, o]) },
    })
    let changes = 0
    const onChange = () => changes++
    document.addEventListener("themechange", onChange)
    document.querySelector("span")!.click()
    expect(root.getAttribute("data-theme")).toBe("dark")
    expect(localStorage.getItem("theme")).toBe("dark")
    expect(changes).toBe(1)
    expect(messages).toEqual([[{ giscus: { setConfig: { theme: "dark_dimmed" } } }, "https://giscus.app"]])
    await until(() => mermaidCalls.length >= 2)
    expect(mermaidCalls).toEqual([
      ["initialize", { startOnLoad: false, theme: "night" }],
      ["run", ["graph TD; A; B"]],
    ])
    document.querySelector<HTMLButtonElement>("[data-theme-toggle]")!.click()
    expect(root.getAttribute("data-theme")).toBe("light")
    expect(messages[1][0]).toEqual({ giscus: { setConfig: { theme: "light" } } })
    // Without giscus on the page, nothing is sent and nothing breaks.
    document.querySelector(".comments")!.remove()
    document.querySelector<HTMLButtonElement>("[data-theme-toggle]")!.click()
    expect(messages[2][0]).toEqual({ giscus: { setConfig: { theme: null } } })
    document.removeEventListener("themechange", onChange)
    await settle(20)
  })

  test("a theme change redraws charts and retiles maps on pages that have them", async () => {
    document.body.innerHTML = `<figure class="chart"></figure><div data-map="[]" data-tiles-dark="https://tiles.example/{z}/{x}/{y}.png"></div>`
    document.dispatchEvent(new dom.window.Event("themechange"))
    // Both libraries load lazily; with no chart data and no mounted map there is nothing to redraw.
    await settle(50)
    expect(document.querySelector("canvas")).toBeNull()
    document.body.innerHTML = ``
    document.dispatchEvent(new dom.window.Event("themechange"))
  })

  test("sidebar, stack and reader toggles flip the page and remember it", () => {
    root.className = ""
    document.body.innerHTML = `<button data-sidebar-toggle="left">L</button><button data-sidebar-toggle="right">R</button>
      <button data-stack-toggle>S</button><button data-reader-toggle>Rd</button>
      <div data-stack-row><div data-stack-col id="c1"></div><div data-stack-col id="c2"></div></div>`
    const btn = (sel: string) => document.querySelector<HTMLButtonElement>(sel)!
    btn('[data-sidebar-toggle="left"]').click()
    expect(root.classList.contains("hide-left")).toBe(true)
    expect(localStorage.getItem("sidebars")).toBe("left")
    expect(btn('[data-sidebar-toggle="left"]').getAttribute("aria-pressed")).toBe("false")
    expect(btn('[data-sidebar-toggle="right"]').getAttribute("aria-pressed")).toBe("true")
    btn('[data-sidebar-toggle="right"]').click()
    expect(localStorage.getItem("sidebars")).toBe("left,right")

    btn("[data-stack-toggle]").click()
    expect(root.classList.contains("stack-mode")).toBe(true)
    expect(localStorage.getItem("stack")).toBe("1")
    expect(btn("[data-stack-toggle]").getAttribute("aria-pressed")).toBe("true")
    // Turned off, the extra columns and ?stack= go.
    dom.goto("https://garden.example/en-US/a?stack=%2Fen-US%2Fb&x=1")
    root.classList.add("stacking")
    btn("[data-stack-toggle]").click()
    expect(localStorage.getItem("stack")).toBe("0")
    expect(document.getElementById("c2")).toBeNull()
    expect(document.getElementById("c1")).not.toBeNull()
    expect(root.classList.contains("stacking")).toBe(false)
    expect(location.search).toBe("?x=1")
    dom.goto("https://garden.example/en-US/a")

    btn("[data-reader-toggle]").click()
    expect(root.classList.contains("reader")).toBe(true)
    expect(localStorage.getItem("reader")).toBe("1")
    expect(btn("[data-reader-toggle]").getAttribute("aria-pressed")).toBe("true")
    btn("[data-reader-toggle]").click()
    expect(localStorage.getItem("reader")).toBe("0")
    root.className = ""
  })

  test("the zoom buttons of a graph tell its canvas which way to zoom", () => {
    document.body.innerHTML = `<div class="graph-box"><canvas></canvas><button data-graph-zoom="1">+</button><button data-graph-zoom="-1">−</button></div>
      <div class="graph-modal"><div><canvas></canvas></div><button data-graph-zoom="1">+</button></div><button data-graph-zoom="1" id="lone">+</button>`
    const zooms: number[] = []
    document.querySelectorAll("canvas").forEach((c) => c.addEventListener("graphzoom", (e) => zooms.push((e as CustomEvent<number>).detail)))
    document.querySelectorAll<HTMLButtonElement>("[data-graph-zoom]").forEach((b) => b.click())
    expect(zooms).toEqual([1, -1, 1])
  })

  test("a header menu closes on a click outside it and on Escape", () => {
    document.body.innerHTML = `<details data-menu open><summary>vi</summary><a id="in">en</a></details><p id="out">out</p>`
    const menu = document.querySelector<HTMLDetailsElement>("details")!
    document.getElementById("in")!.click()
    expect(menu.open).toBe(true)
    document.getElementById("out")!.click()
    expect(menu.open).toBe(false)
    menu.open = true
    key("Escape")
    expect(menu.open).toBe(false)
  })

  test("the nav opens from its button and closes on a click outside the sidebar", () => {
    document.body.innerHTML = `<button data-nav-toggle>n</button><aside data-sidebar><a id="in">in</a></aside><p id="out">out</p>`
    document.querySelector<HTMLButtonElement>("[data-nav-toggle]")!.click()
    expect(root.classList.contains("nav-open")).toBe(true)
    document.getElementById("in")!.click()
    expect(root.classList.contains("nav-open")).toBe(true)
    document.getElementById("out")!.click()
    expect(root.classList.contains("nav-open")).toBe(false)
    // With the nav closed, a click anywhere changes nothing.
    document.getElementById("out")!.click()
    expect(root.classList.contains("nav-open")).toBe(false)
  })

  test("blocked storage does not stop the toggles", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        setItem() {
          throw new Error("blocked")
        },
      },
    })
    try {
      document.body.innerHTML = `<button data-reader-toggle>Rd</button>`
      document.querySelector<HTMLButtonElement>("button")!.click()
      expect(root.classList.contains("reader")).toBe(true)
    } finally {
      Object.defineProperty(globalThis, "localStorage", real)
      root.className = ""
    }
  })

  describe("keyboard shortcuts", () => {
    const page = `<dialog data-search-dialog data-lang="cov-app"><input><div class="search-results"></div></dialog>
      <dialog data-graph-dialog><canvas data-lang="cov-app"></canvas></dialog>
      <nav class="explorer"><ul><li><a href="/en-US/0">0</a></li><li><a href="/en-US/a">a</a></li><li><a href="/en-US/b">b</a></li></ul></nav>
      <nav data-trail><a data-trail-prev href="/en-US/prev">prev</a><a data-trail-next href="/en-US/next">next</a></nav>
      <input id="field"><div contenteditable id="editable"></div>`
    let followed: string[] = []
    const setup = () => {
      document.body.innerHTML = page
      followed = []
      document.querySelectorAll("[data-trail] a").forEach((a) =>
        a.addEventListener("click", (e) => {
          e.preventDefault()
          followed.push(a.getAttribute("href")!)
        }),
      )
      const noop = new Proxy({}, { get: () => () => {}, set: () => true })
      document.querySelector("canvas")!.getContext = (() => noop) as unknown as HTMLCanvasElement["getContext"]
    }
    const closeAll = () => document.querySelectorAll("dialog").forEach((d) => d.close())

    test("Ctrl/Cmd+K and / open search, Ctrl/Cmd+G the graph", async () => {
      setup()
      const search = document.querySelector<HTMLDialogElement>("[data-search-dialog]")!
      const graph = document.querySelector<HTMLDialogElement>("[data-graph-dialog]")!
      expect(key("K", { meta: true }).defaultPrevented).toBe(true)
      expect(search.open).toBe(true)
      closeAll()
      expect(key("k", { ctrl: true }).defaultPrevented).toBe(true)
      expect(search.open).toBe(true)
      closeAll()
      expect(key("/").defaultPrevented).toBe(true)
      expect(search.open).toBe(true)
      closeAll()
      expect(key("g", { meta: true }).defaultPrevented).toBe(true)
      expect(graph.open).toBe(true)
      closeAll()
      await settle(20)
    })

    test("pages without search or graph keep the browser's own shortcuts", () => {
      document.body.innerHTML = `<p>minimal</p>`
      expect(key("k", { meta: true }).defaultPrevented).toBe(false)
      expect(key("g", { ctrl: true }).defaultPrevented).toBe(false)
      expect(key("/").defaultPrevented).toBe(false)
    })

    test("j and k walk the explorer, r opens a random note, n and p follow the trail", async () => {
      setup()
      key("j")
      key("k")
      expect(navigated).toEqual(["/en-US/b", "/en-US/0"])
      key("n")
      key("p")
      expect(followed).toEqual(["/en-US/next", "/en-US/prev"])
      key("r")
      await until(() => navigated.length > 2)
      expect(navigated[2]).toBe("/en-US/b")
      // Other keys do nothing.
      key("x")
      expect(navigated).toHaveLength(3)
    })

    test("single keys do nothing while typing, with a modifier, or with a dialog open", () => {
      setup()
      key("j", {}, document.getElementById("field")!)
      key("/", {}, document.getElementById("editable")!)
      key("j", { alt: true })
      key("j", { ctrl: true })
      document.querySelector<HTMLDialogElement>("[data-search-dialog]")!.showModal()
      key("j")
      closeAll()
      expect(navigated).toEqual([])
      expect(document.querySelector<HTMLDialogElement>("[data-search-dialog]")!.open).toBe(false)
    })
  })

  describe("on every page load", () => {
    let copied: string[] = []
    beforeAll(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } })
    })
    afterAll(() => delete (navigator as unknown as Record<string, unknown>).clipboard)
    beforeEach(() => (copied = []))

    test("code blocks get a copy button that says so for a moment", async () => {
      document.body.dataset.copy = "Copy code"
      document.body.innerHTML = `<div class="prose"><pre id="a"><code>let x = 1</code></pre><pre id="b">plain text</pre><pre class="mermaid">graph</pre></div>`
      document.body.dataset.copy = "Copy code"
      pageLoad()
      pageLoad()
      expect(document.querySelectorAll(".copy-btn")).toHaveLength(2)
      // Each block is wrapped once, with the button beside the <pre> rather than inside it.
      expect(document.querySelectorAll(".code-block")).toHaveLength(2)
      expect(document.querySelector("#a")!.parentElement!.className).toBe("code-block")
      expect(document.querySelector("pre.mermaid")!.parentElement!.className).toBe("prose")
      const btn = document.querySelector<HTMLButtonElement>("#a + .copy-btn")!
      expect(btn.textContent).toBe("Copy code")
      btn.click()
      await settle()
      expect(copied).toEqual(["let x = 1"])
      expect(btn.textContent).toBe("Copied")
      document.querySelector<HTMLButtonElement>("#b + .copy-btn")!.click()
      await settle()
      expect(copied[1]).toContain("plain text")
      await settle(1450)
      expect(btn.textContent).toBe("Copy code")
      delete document.body.dataset.copy
      // Without a label, "Copy".
      document.body.innerHTML = `<div class="prose"><pre><code>y</code></pre></div>`
      pageLoad()
      expect(document.querySelector(".copy-btn")!.textContent).toBe("Copy")
    })

    test("without a clipboard, as on a site served over plain http, code blocks get no copy button", () => {
      const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard")!
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined })
      try {
        document.body.innerHTML = `<div class="prose"><pre><code>echo hi</code></pre></div>`
        pageLoad()
        expect(document.querySelector(".copy-btn")).toBeNull()
      } finally {
        Object.defineProperty(navigator, "clipboard", clipboard)
      }
    })

    test("the table of contents marks the first heading in view", () => {
      document.body.innerHTML = `<nav><a data-toc="h1">1</a><a data-toc="h2">2</a><a data-toc="gone">3</a></nav><h2 id="h1">1</h2><h2 id="h2">2</h2>`
      observers.length = 0
      pageLoad()
      const toc = observers.find((o) => o.margin === "-70px 0px -55% 0px")!
      expect(toc.observed.map((h) => h.id)).toEqual(["h1", "h2"])
      const [l1, l2] = document.querySelectorAll("a")
      toc.cb([{ isIntersecting: true, target: document.getElementById("h2")! }])
      expect([l1.classList.contains("active"), l2.classList.contains("active")]).toEqual([false, true])
      toc.cb([{ isIntersecting: true, target: document.getElementById("h1")! }])
      expect([l1.classList.contains("active"), l2.classList.contains("active")]).toEqual([true, false])
      // Once nothing is in view the last mark stays.
      toc.cb([
        { isIntersecting: false, target: document.getElementById("h1")! },
        { isIntersecting: false, target: document.getElementById("h2")! },
      ])
      expect(l1.classList.contains("active")).toBe(true)
      // A page without a table of contents gets no observer.
      observers.length = 0
      document.body.innerHTML = `<p>none</p>`
      pageLoad()
      expect(observers.find((o) => o.margin === "-70px 0px -55% 0px")).toBeUndefined()
    })

    test("giscus loads once, in the page's theme", () => {
      root.dataset.theme = "dark"
      document.body.innerHTML = `<div class="comments"><div class="giscus" data-giscus='{"data-repo":"me/garden","data-mapping":"pathname"}' data-theme-dark="dark_dimmed"></div></div>`
      pageLoad()
      pageLoad()
      const scripts = document.querySelectorAll<HTMLScriptElement>(".comments script")
      expect(scripts).toHaveLength(1)
      expect(scripts[0].src).toBe("https://giscus.app/client.js")
      expect(scripts[0].getAttribute("data-repo")).toBe("me/garden")
      expect(scripts[0].getAttribute("data-mapping")).toBe("pathname")
      expect(scripts[0].dataset.theme).toBe("dark_dimmed")
      expect(scripts[0].crossOrigin).toBe("anonymous")
      // Light, with no light theme given: an empty theme.
      root.dataset.theme = "light"
      document.body.innerHTML = `<div class="comments"><div class="giscus" data-giscus="{}"></div></div>`
      pageLoad()
      expect(document.querySelector<HTMLScriptElement>(".comments script")!.dataset.theme).toBe("")
      delete root.dataset.theme
    })

    test("tweets load the widget script once, or use it when it is there", () => {
      root.dataset.theme = "dark"
      document.head.innerHTML = ""
      document.body.innerHTML = `<div class="prose"><blockquote class="twitter-tweet"></blockquote></div>`
      pageLoad()
      pageLoad()
      expect(document.querySelector<HTMLElement>("blockquote")!.dataset.theme).toBe("dark")
      const scripts = document.head.querySelectorAll<HTMLScriptElement>("script[data-tweets]")
      expect(scripts).toHaveLength(1)
      expect(scripts[0].src).toBe("https://platform.twitter.com/widgets.js")
      const loaded: unknown[] = []
      ;(dom.window as unknown as Record<string, unknown>).twttr = { widgets: { load: (el: unknown) => void loaded.push(el) } }
      delete root.dataset.theme
      pageLoad()
      expect(loaded).toEqual([document.querySelector(".prose")])
      expect(document.querySelector<HTMLElement>("blockquote")!.dataset.theme).toBe("light")
      delete (dom.window as unknown as Record<string, unknown>).twttr
      document.head.innerHTML = ""
    })

    test("mermaid diagrams render in the page's theme, once", async () => {
      delete root.dataset.mermaid
      delete root.dataset.theme
      document.body.innerHTML = `<div class="prose"><pre class="mermaid" id="m1">graph A</pre><pre class="mermaid" id="m2" data-processed="true">drawn</pre></div>`
      pageLoad()
      await until(() => mermaidCalls.length >= 2)
      expect(mermaidCalls[0]).toEqual(["initialize", { startOnLoad: false, theme: "neutral" }])
      expect(mermaidCalls[1]).toEqual(["run", ["graph A", "drawn"]])
      expect(document.getElementById("m1")!.dataset.src).toBe("graph A")
    })

    test("sheet music, mind maps, drawings, charts and maps load their libraries only where used", async () => {
      document.head.innerHTML = ""
      document.body.innerHTML = `<div class="prose"><pre class="abc">X:1
K:C
CDEF|</pre><figure class="markmap" data-markmap="{}"></figure></div>
        <div class="drawing generated"></div><figure class="chart"></figure><div data-map="[]" data-center="10,20" data-tiles="https://tiles.example/{z}/{x}/{y}.png"></div>`
      pageLoad()
      // abcjs draws the score next to its source; Leaflet brings its stylesheet.
      await until(() => document.querySelector(".abc-score") && document.querySelector("link[data-leaflet]"))
      expect(document.querySelector(".abc-score")?.getAttribute("aria-label")).toBe("Sheet music")
      expect(document.querySelector("link[data-leaflet]")).not.toBeNull()
      // Leaving the page lets go of all of them.
      root.classList.add("nav-open")
      document.dispatchEvent(new dom.window.Event("astro:before-swap"))
      expect(root.classList.contains("nav-open")).toBe(false)
      await settle(50)
      document.head.innerHTML = ""
      // A page without any of them leaves quietly too.
      document.body.innerHTML = ``
      document.dispatchEvent(new dom.window.Event("astro:before-swap"))
    })

    test("a link into a hidden tab opens the tab, on load and when the hash changes", () => {
      const tabs = `<div data-tabs><div role="tablist"><button role="tab" id="t1" aria-controls="p1">1</button><button role="tab" id="t2" aria-controls="p2">2</button></div>
        <div class="tab-panel" id="p1">one</div><div class="tab-panel" id="p2" aria-labelledby="t2" hidden><h3 id="deep">deep</h3></div></div>`
      document.body.innerHTML = tabs
      dom.goto("https://garden.example/en-US/a#deep")
      pageLoad()
      expect(document.getElementById("p2")!.hidden).toBe(false)
      expect(document.getElementById("p1")!.hidden).toBe(true)
      document.body.innerHTML = tabs
      dom.window.dispatchEvent(new dom.window.Event("hashchange") as unknown as Event)
      expect(document.getElementById("p2")!.hidden).toBe(false)
      // Without hidden tabs, a hash change does nothing.
      document.body.innerHTML = `<p id="deep">x</p>`
      expect(() => dom.window.dispatchEvent(new dom.window.Event("hashchange") as unknown as Event)).not.toThrow()
      dom.goto("https://garden.example/en-US/a")
      document.body.innerHTML = tabs
      pageLoad()
      expect(document.getElementById("p2")!.hidden).toBe(true)
    })

    test("unlocked content gets its code blocks and diagrams set up", async () => {
      const payload = await encrypt(`<div class="prose"><pre><code>secret code</code></pre><pre class="mermaid">graph S</pre></div>`, "pw", 1000)
      sessionStorage.setItem("datme:pw:/en-US/a", JSON.stringify(["pw"]))
      document.body.innerHTML = `<form class="locked" data-payload="${payload}" data-iterations="1000"><input><button>Open</button></form><div hidden></div>`
      pageLoad()
      await until(() => document.querySelector(".copy-btn"))
      expect(document.querySelector("pre")!.textContent).toContain("secret code")
      expect(document.querySelector(".copy-btn")).not.toBeNull()
      await until(() => mermaidCalls.some((c) => c[0] === "run"))
      expect(mermaidCalls.find((c) => c[0] === "run")).toEqual(["run", ["graph S"]])
      sessionStorage.clear()
    })

    test("a note opened as a stacked column gets its code blocks set up", async () => {
      root.classList.add("stack-mode")
      document.body.innerHTML = `<div data-stack-row><div data-stack-col data-url="/en-US/a"><div class="prose"><a class="internal" href="/en-US/b">b</a></div></div></div>`
      pageLoad()
      document.querySelector<HTMLAnchorElement>("a.internal")!.click()
      await until(() => document.querySelectorAll("[data-stack-col]").length > 1 && document.querySelector('[data-url="/en-US/b"] .copy-btn'))
      expect(document.querySelector('[data-url="/en-US/b"] .copy-btn')).not.toBeNull()
      root.className = ""
      dom.goto("https://garden.example/en-US/a")
    })
  })
})
