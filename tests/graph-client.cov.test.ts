import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"
import type { IndexNote } from "../src/scripts/data"
import { GROUP_COLORS } from "../src/scripts/graph-colors"

type Graph = typeof import("../src/scripts/graph")

const navigated: string[] = []
mock.module("astro:transitions/client", () => ({ navigate: (u: string) => void navigated.push(u) }))

const DAY = 86_400_000
const today = Math.floor(Date.now() / DAY)
const LONG = "A very long title that will not fit on the graph"

const note = (u: string, t: string, over: Partial<IndexNote> = {}): IndexNote => ({ u, t, a: [], g: [], p: "", y: [], s: null, f: "", d: "", c: "", ...over })
const NOTES: IndexNote[] = [
  note("/en-US/a", "A", { p: "Notes", y: ["book"], st: "tree", tp: "pkm", m: today - 3, k: 100 }),
  note("/en-US/b", "B", { p: "Notes", m: today - 100, k: 200 }),
  note("/en-US/c", LONG, { p: "Books", y: ["film"], m: null, k: null }),
  note("/en-US/d", "D", { p: "Books", m: today - 1000, k: 300 }),
  note("/en-US/e", "E", { p: "Books" }),
]
const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
]

interface Call {
  op: string
  args: unknown[]
  fill: string
  stroke: string
  alpha: number
}
/** A 2D context that records what is drawn. */
function fakeContext() {
  const calls: Call[] = []
  const ctx: Record<string, unknown> = { fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1, font: "", textAlign: "" }
  for (const op of ["setTransform", "clearRect", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill", "strokeText", "fillText"])
    ctx[op] = (...args: unknown[]) => void calls.push({ op, args, fill: ctx.fillStyle as string, stroke: ctx.strokeStyle as string, alpha: ctx.globalAlpha as number })
  return { ctx, calls }
}

/** What the last frame drew: notes as circles, links as lines, and labels. */
function lastFrame(calls: Call[]) {
  let start = -1
  calls.forEach((c, i) => c.op === "clearRect" && (start = i))
  const frame = calls.slice(start)
  const circles = frame.filter((c) => c.op === "arc").map((c) => ({ x: c.args[0] as number, y: c.args[1] as number, r: c.args[2] as number }))
  const fills = frame.filter((c) => c.op === "fill").map((c) => c.fill)
  const labels = frame.filter((c) => c.op === "fillText").map((c) => c.args[0] as string)
  const lines = frame.filter((c) => c.op === "stroke" && frame[frame.indexOf(c) - 1]?.op === "lineTo").map((c) => ({ stroke: c.stroke, alpha: c.alpha }))
  return { circles, fills, labels, lines, count: calls.filter((c) => c.op === "clearRect").length }
}

describe("the graph in the browser", () => {
  let dom: Dom
  let graph: Graph
  const realFetch = globalThis.fetch
  const contexts = new Map<HTMLCanvasElement, ReturnType<typeof fakeContext>>()
  const resizers = new Map<Element, { cb: () => void; disconnected: boolean }>()
  const watchers: { cb: (e: { isIntersecting: boolean }[]) => void; disconnected: boolean; observed: Element[]; margin?: string }[] = []
  const frames: (() => void)[] = []
  const cancelled: number[] = []
  let reducedMotion = false
  let realGetContext: unknown

  beforeAll(async () => {
    dom = installDom("https://garden.example/en-US/a")
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes("undated")) return new Response(JSON.stringify({ notes: NOTES.map((n) => ({ ...n, k: null })), links: LINKS }))
      return new Response(JSON.stringify({ notes: NOTES, links: LINKS }))
    }) as unknown as typeof fetch
    dom.set(
      "ResizeObserver",
      class {
        entry = { cb: () => {}, disconnected: false }
        constructor(cb: () => void) {
          this.entry.cb = cb
        }
        observe(el: Element) {
          resizers.set(el, this.entry)
        }
        disconnect() {
          this.entry.disconnected = true
        }
      },
    )
    dom.set(
      "IntersectionObserver",
      class {
        entry: (typeof watchers)[number]
        constructor(cb: (e: { isIntersecting: boolean }[]) => void, opts: { rootMargin?: string }) {
          this.entry = { cb, disconnected: false, observed: [], margin: opts.rootMargin }
          watchers.push(this.entry)
        }
        observe(el: Element) {
          this.entry.observed.push(el)
        }
        disconnect() {
          this.entry.disconnected = true
        }
      },
    )
    // The layout runs on the page unless a test hands it a worker.
    dom.set("Worker", undefined)
    dom.set("requestAnimationFrame", (cb: () => void) => frames.push(cb))
    dom.set("cancelAnimationFrame", (id: number) => void cancelled.push(id))
    dom.set("matchMedia", (q: string) => ({ matches: q.includes("reduce") && reducedMotion }))
    const proto = dom.window.HTMLCanvasElement.prototype as unknown as Record<string, unknown>
    realGetContext = proto.getContext
    proto.getContext = function (this: HTMLCanvasElement) {
      if (!contexts.has(this)) contexts.set(this, fakeContext())
      return contexts.get(this)!.ctx
    }
    proto.setPointerCapture = () => {}
    const root = document.documentElement.style
    for (const [k, v] of Object.entries({ "--muted": "grey", "--accent": "blue", "--clay": "clay", "--line-strong": "line", "--ink": "ink", "--surface": "paper" })) root.setProperty(k, v)
    graph = await import("../src/scripts/graph")
  })
  beforeEach(() => {
    navigated.length = 0
    frames.length = 0
    cancelled.length = 0
    reducedMotion = false
    localStorage.clear()
  })
  afterAll(() => {
    graph.teardownGraphs()
    ;(dom.window.HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = realGetContext
    globalThis.fetch = realFetch
    dom.restore()
  })

  const makeCanvas = (lang: string, attrs: Record<string, string> = {}, parent: Element = document.body) => {
    const canvas = document.createElement("canvas")
    canvas.dataset.lang = lang
    canvas.dataset.current = "/en-US/a"
    Object.assign(canvas.dataset, attrs)
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 400 })
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 300 })
    parent.append(canvas)
    return canvas
  }
  const resize = (canvas: HTMLCanvasElement) => resizers.get(canvas)!.cb()
  const frame = (canvas: HTMLCanvasElement) => lastFrame(contexts.get(canvas)!.calls)
  const pointer = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1 }) as PointerEvent

  test("a canvas taken off the page while the index loads draws nothing", async () => {
    const canvas = makeCanvas("cov-graph")
    const mounting = graph.mountGraph(canvas, "global")
    canvas.remove()
    expect(await mounting).toBeUndefined()
    expect(contexts.has(canvas)).toBe(false)
  })

  test("a canvas taken off the page while the layout loads stops it", async () => {
    const canvas = makeCanvas("cov-graph")
    let checks = 0
    Object.defineProperty(canvas, "isConnected", { get: () => checks++ === 0 })
    expect(await graph.mountGraph(canvas, "global", {}, { space: true })).toBeUndefined()
    expect(checks).toBe(2)
    expect(contexts.has(canvas)).toBe(false)
  })

  describe("laid out in a worker", () => {
    interface Posted {
      r: number[]
      links: [number, number][]
      mode: string
      space: boolean
    }
    const workers: FakeWorker[] = []
    class FakeWorker {
      url: string
      type?: string
      posted: Posted[] = []
      terminated = false
      onmessage: ((e: { data: Float32Array }) => void) | null = null
      onerror: (() => void) | null = null
      constructor(url: URL, opts: { type?: string }) {
        this.url = String(url)
        this.type = opts.type
        workers.push(this)
      }
      postMessage(data: Posted) {
        this.posted.push(data)
      }
      terminate() {
        this.terminated = true
      }
    }
    beforeEach(() => {
      workers.length = 0
      dom.set("Worker", FakeWorker)
    })
    afterEach(() => dom.set("Worker", undefined))
    const flush = () => frames.splice(0).forEach((f) => f())

    test("the page posts radii and links, and draws only what the worker places", async () => {
      const canvas = makeCanvas("cov-graph")
      const stop = (await graph.mountGraph(canvas, "global"))!
      const [w] = workers
      expect(w.url).toEndWith("graph-worker.ts")
      expect(w.type).toBe("module")
      expect(w.posted).toHaveLength(1)
      const req = w.posted[0]
      expect(req.mode).toBe("global")
      expect(req.space).toBe(false)
      expect(req.r).toHaveLength(5)
      expect(req.links).toEqual(LINKS)
      // Before the first positions there is nothing to draw.
      resize(canvas)
      expect(contexts.get(canvas)!.calls.filter((c) => c.op === "clearRect")).toHaveLength(0)
      w.onmessage!({ data: new Float32Array([0, 0, 50, 0, 100, 0, 150, 0, 200, 0]) })
      // Positions arrive every tick; the page draws them once a frame.
      w.onmessage!({ data: new Float32Array([0, 0, 50, 0, 100, 0, 150, 0, 200, 10]) })
      expect(frames).toHaveLength(1)
      flush()
      const f = frame(canvas)
      expect(f.circles).toHaveLength(5)
      const xs = f.circles.map((c) => c.x)
      expect(xs).toEqual([...xs].sort((a, b) => a - b))
      stop()
      expect(w.terminated).toBe(true)
    })

    test("in space the worker places notes in three dimensions", async () => {
      reducedMotion = true
      const canvas = makeCanvas("cov-graph")
      const stop = (await graph.mountGraph(canvas, "global", {}, { space: true }))!
      const [w] = workers
      expect(w.posted[0].space).toBe(true)
      w.onmessage!({ data: new Float32Array(Array.from({ length: 15 }, (_, i) => i * 7)) })
      flush()
      resize(canvas)
      expect(frame(canvas).circles).toHaveLength(5)
      stop()
    })

    test("a worker that fails hands the layout back to the page", async () => {
      const canvas = makeCanvas("cov-graph")
      const stop = (await graph.mountGraph(canvas, "local"))!
      const [w] = workers
      w.onerror!()
      expect(w.terminated).toBe(true)
      await settle(30)
      resize(canvas)
      expect(frame(canvas).circles).toHaveLength(2)
      stop()
    })

    test("a graph stopped before the page took over its layout stays stopped", async () => {
      const canvas = makeCanvas("cov-graph")
      const stop = (await graph.mountGraph(canvas, "local"))!
      stop()
      workers[0].onerror!()
      await settle(30)
      resize(canvas)
      expect(contexts.get(canvas)!.calls.filter((c) => c.op === "clearRect")).toHaveLength(0)
    })
  })

  test("the local graph shows the current note and its links, coloured and labelled", async () => {
    const canvas = makeCanvas("cov-graph")
    const stop = (await graph.mountGraph(canvas, "local"))!
    stop()
    resize(canvas)
    const f = frame(canvas)
    // A and B, one link deep.
    expect(f.circles).toHaveLength(2)
    expect(f.labels).toEqual(["A", "B"])
    expect(f.fills).toEqual(["clay", "grey"])
    expect(f.lines).toEqual([{ stroke: "line", alpha: 0.6 }])
    // The current note is drawn larger with its links, and fits in view.
    for (const c of f.circles) {
      expect(c.x).toBeGreaterThan(0)
      expect(c.x).toBeLessThan(400)
    }
    expect(resizers.get(canvas)!.disconnected).toBe(true)
  })

  test("two links deep, the farther notes stay fainter and long titles are cut", async () => {
    const canvas = makeCanvas("cov-graph", { current: "/en-US/b/" })
    const stop = (await graph.mountGraph(canvas, "local", {}, { depth: 2 }))!
    stop()
    resize(canvas)
    const f = frame(canvas)
    expect(f.labels).toEqual(["A", "B", "A very long title that will no…", "D"])
    const calls = contexts.get(canvas)!.calls
    const dFill = calls.filter((c) => c.op === "fill").at(-1)!
    expect(dFill.alpha).toBe(0.55)
    // The link from the long-titled note to D is two hops out.
    expect(f.lines.map((l) => l.alpha)).toEqual([0.6, 0.6, 0.35])
  })

  test("a local graph of a page not in the index is empty", async () => {
    const canvas = makeCanvas("cov-graph", { current: "/en-US/nowhere" })
    const stop = (await graph.mountGraph(canvas, "local"))!
    stop()
    resize(canvas)
    expect(frame(canvas).circles).toHaveLength(0)
  })

  test("hovering a note lights it and its neighbours; leaving puts the graph back", async () => {
    const canvas = makeCanvas("cov-graph")
    const stop = (await graph.mountGraph(canvas, "local"))!
    stop()
    resize(canvas)
    const [a, b] = frame(canvas).circles
    canvas.onpointermove!(pointer(b.x, b.y))
    expect(canvas.style.cursor).toBe("pointer")
    expect(canvas.title).toBe("B")
    let f = frame(canvas)
    expect(f.fills).toEqual(["clay", "blue"])
    expect(f.lines).toEqual([{ stroke: "blue", alpha: 0.9 }])
    // Moving over the same note draws nothing new.
    const count = f.count
    canvas.onpointermove!(pointer(b.x + 1, b.y))
    expect(frame(canvas).count).toBe(count)
    canvas.onpointermove!(pointer(a.x, a.y))
    expect(canvas.title).toBe("A")
    canvas.onpointermove!(pointer(-500, -500))
    expect(canvas.style.cursor).toBe("grab")
    expect(canvas.title).toBe("")
    canvas.onpointermove!(pointer(b.x, b.y))
    canvas.onpointerleave!(pointer(0, 0))
    f = frame(canvas)
    expect(f.fills).toEqual(["clay", "grey"])
  })

  test("a click on another note follows it and closes the dialog; on the current note it does nothing", async () => {
    const dialog = document.createElement("dialog")
    document.body.append(dialog)
    dialog.showModal()
    const canvas = makeCanvas("cov-graph", {}, dialog)
    const stop = (await graph.mountGraph(canvas, "local"))!
    stop()
    resize(canvas)
    const [a, b] = frame(canvas).circles
    canvas.onpointerdown!(pointer(a.x, a.y))
    canvas.onpointerup!(pointer(a.x, a.y))
    expect(navigated).toEqual([])
    expect(dialog.open).toBe(true)
    canvas.onpointerdown!(pointer(b.x, b.y))
    canvas.onpointerup!(pointer(b.x, b.y))
    expect(navigated).toEqual(["/en-US/b"])
    expect(dialog.open).toBe(false)
    // Off the dialog, a click on a note just follows it.
    const loose = makeCanvas("cov-graph")
    ;(await graph.mountGraph(loose, "local"))!()
    resize(loose)
    const lb = frame(loose).circles[1]
    canvas.onpointerup!(pointer(-500, -500))
    loose.onpointerup!(pointer(lb.x, lb.y))
    expect(navigated).toEqual(["/en-US/b", "/en-US/b"])
  })

  test("dragging a flat graph pans it, and the drag is not a click", async () => {
    const canvas = makeCanvas("cov-graph")
    const stop = (await graph.mountGraph(canvas, "local"))!
    stop()
    resize(canvas)
    const before = frame(canvas).circles
    canvas.onpointerdown!(pointer(10, 10))
    // A small move is no drag yet.
    canvas.onpointermove!(pointer(11, 11))
    expect(frame(canvas).circles).toEqual(before)
    canvas.onpointermove!(pointer(40, 30))
    const after = frame(canvas).circles
    expect(after[0].x - before[0].x).toBeCloseTo(30)
    expect(after[0].y - before[0].y).toBeCloseTo(20)
    canvas.onpointerup!(pointer(after[1].x, after[1].y))
    expect(navigated).toEqual([])
    // Once panned by hand it stays put on resize.
    resize(canvas)
    expect(frame(canvas).circles).toEqual(after)
  })

  test("the wheel zooms around the pointer, within limits", async () => {
    const canvas = makeCanvas("cov-graph")
    const stop = (await graph.mountGraph(canvas, "local"))!
    stop()
    resize(canvas)
    const r0 = frame(canvas).circles[0].r
    let prevented = false
    const wheel = (deltaY: number) => ({ deltaY, clientX: 200, clientY: 150, preventDefault: () => (prevented = true) }) as unknown as WheelEvent
    canvas.onwheel!(wheel(-200))
    expect(prevented).toBe(true)
    expect(frame(canvas).circles[0].r).toBeGreaterThan(r0)
    canvas.onwheel!(wheel(100000))
    const small = frame(canvas).circles[0]
    canvas.onwheel!(wheel(100000))
    expect(frame(canvas).circles[0].r).toBeCloseTo(small.r)
  })

  test("the global graph colours notes by the chosen group and hides notes planted later", async () => {
    const groups = async (colorBy: string, extra: Record<string, string> = {}) => {
      const canvas = makeCanvas("cov-graph", { colorBy, ...extra })
      const stop = (await graph.mountGraph(canvas, "global"))!
      stop()
      resize(canvas)
      return frame(canvas).fills.slice(1)
    }
    const [c0, c1, c2] = GROUP_COLORS
    // B, C, D, E after the current note A.
    expect(await groups("folder")).toEqual([c1, c0, c0, c0])
    expect(await groups("type")).toEqual(["grey", c1, "grey", "grey"])
    expect(await groups("stage")).toEqual(["grey", "grey", "grey", "grey"])
    expect(await groups("topic")).toEqual(["grey", "grey", "grey", "grey"])
    const fresh = JSON.stringify({ month: "Fresh", year: "This year", older: "Old" })
    // Fresh, Old, This year: B is this year's, D old, C undated.
    expect(await groups("fresh", { freshLabels: fresh })).toEqual([c2, "grey", c1, "grey"])
    expect(await groups("fresh")).toEqual(["grey", "grey", "grey", "grey"])
    localStorage.setItem("datme:visited", JSON.stringify({ visits: { "/en-US/d": 1 } }))
    expect(await groups("visited", { visitedLabel: "Seen" })).toEqual(["grey", "grey", c0, "grey"])
    expect(await groups("visited")).toEqual(["grey", "grey", "grey", "grey"])

    const canvas = makeCanvas("cov-graph", { until: "200" })
    const stop = (await graph.mountGraph(canvas, "global", { folder: "Notes" }))!
    stop()
    resize(canvas)
    expect(frame(canvas).labels).toEqual(["A", "B"])
    canvas.dataset.until = "100"
    canvas.dispatchEvent(new dom.window.Event("redraw") as unknown as Event)
    // Stopped graphs no longer redraw on request.
    expect(frame(canvas).labels).toEqual(["A", "B"])
    resize(canvas)
    expect(frame(canvas).labels).toEqual(["A"])
  })

  test("a running graph redraws on request and on a theme change, with the new colours", async () => {
    const canvas = makeCanvas("cov-graph")
    const stop = (await graph.mountGraph(canvas, "local"))!
    resize(canvas)
    const count = frame(canvas).count
    canvas.dispatchEvent(new dom.window.Event("redraw") as unknown as Event)
    expect(frame(canvas).count).toBeGreaterThan(count)
    document.documentElement.style.setProperty("--clay", "red")
    document.dispatchEvent(new dom.window.Event("themechange") as unknown as Event)
    expect(frame(canvas).fills[0]).toBe("red")
    document.documentElement.style.setProperty("--clay", "clay")
    stop()
    const after = frame(canvas).count
    canvas.dispatchEvent(new dom.window.Event("redraw") as unknown as Event)
    document.dispatchEvent(new dom.window.Event("themechange") as unknown as Event)
    expect(frame(canvas).count).toBe(after)
  })

  test("in space the graph turns by itself until dragged, and fades far notes", async () => {
    const canvas = makeCanvas("cov-graph")
    const stop = (await graph.mountGraph(canvas, "global", {}, { space: true }))!
    expect(frames).toHaveLength(1)
    resize(canvas)
    const before = frame(canvas).circles
    frames.shift()!()
    expect(frames).toHaveLength(1)
    const turned = frame(canvas).circles
    expect(turned).not.toEqual(before)
    // While hovering a note it holds still.
    const target = turned[0]
    canvas.onpointermove!(pointer(target.x, target.y))
    const hovered = frame(canvas).circles
    frames.shift()!()
    expect(frame(canvas).circles).toEqual(hovered)
    // Some notes are drawn fainter than others: they are farther.
    const alphas = contexts.get(canvas)!.calls.filter((c) => c.op === "fill").slice(-5).map((c) => c.alpha)
    expect(new Set(alphas).size).toBeGreaterThan(1)
    canvas.onpointerleave!(pointer(0, 0))
    // A drag turns it by hand and stops the spin.
    canvas.onpointerdown!(pointer(100, 100))
    canvas.onpointermove!(pointer(140, 80))
    expect(cancelled).toHaveLength(1)
    canvas.onpointermove!(pointer(160, 60))
    expect(cancelled).toHaveLength(1)
    canvas.onpointerup!(pointer(160, 60))
    stop()
    expect(cancelled).toHaveLength(2)
  })

  test("in space with reduced motion the graph stays still", async () => {
    reducedMotion = true
    const canvas = makeCanvas("cov-graph")
    const stop = (await graph.mountGraph(canvas, "global", {}, { space: true }))!
    expect(frames).toHaveLength(0)
    stop()
    // Before its size is known it is drawn without fitting.
    canvas.dispatchEvent(new dom.window.Event("redraw") as unknown as Event)
    resize(canvas)
    expect(frame(canvas).circles).toHaveLength(5)
  })

  test("teardown stops every running graph", async () => {
    const canvas = makeCanvas("cov-graph")
    await graph.mountGraph(canvas, "local")
    graph.teardownGraphs()
    expect(resizers.get(canvas)!.disconnected).toBe(true)
  })

  describe("the local graph of a note page", () => {
    const box = (depth = "") =>
      (document.body.innerHTML = `<div class="graph-box"><button data-graph-depth="1"></button><button data-graph-depth="2"></button></div>`) &&
      makeCanvas("cov-graph", depth ? { depth } : {}, document.querySelector(".graph-box")!)
    const pressed = () => [...document.querySelectorAll("[data-graph-depth]")].map((b) => b.getAttribute("aria-pressed"))

    test("waits until it is in view, at the depth the site sets", async () => {
      const canvas = box("2")
      graph.mountLocalGraph(canvas)
      const w = watchers.at(-1)!
      expect(w.margin).toBe("200px")
      expect(w.observed).toEqual([canvas])
      w.cb([{ isIntersecting: false }])
      expect(w.disconnected).toBe(false)
      expect(pressed()).toEqual([null, null])
      w.cb([{ isIntersecting: true }])
      expect(w.disconnected).toBe(true)
      expect(pressed()).toEqual(["false", "true"])
      await settle(20)
      resize(canvas)
      // A, B one link away, and the long-titled note two links away.
      expect(frame(canvas).circles).toHaveLength(3)
      graph.teardownGraphs()
    })

    test("the reader's last depth wins, and a click changes and remembers it", async () => {
      localStorage.setItem("graphDepth", "1")
      const canvas = box("2")
      graph.mountLocalGraph(canvas)
      watchers.at(-1)!.cb([{ isIntersecting: true }])
      expect(pressed()).toEqual(["true", "false"])
      await settle(20)
      const [one, two] = document.querySelectorAll<HTMLButtonElement>("[data-graph-depth]")
      two.click()
      expect(localStorage.getItem("graphDepth")).toBe("2")
      expect(pressed()).toEqual(["false", "true"])
      // A quicker second click wins over the first.
      one.click()
      await settle(30)
      resize(canvas)
      expect(frame(canvas).circles).toHaveLength(2)
      expect(pressed()).toEqual(["true", "false"])
      graph.teardownGraphs()
    })

    test("without buttons or storage it still shows, one link deep", async () => {
      document.body.innerHTML = ""
      const canvas = makeCanvas("cov-graph")
      const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!
      const throws = () => {
        throw new Error("blocked")
      }
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: throws, setItem: throws } })
      try {
        graph.mountLocalGraph(canvas)
        watchers.at(-1)!.cb([{ isIntersecting: true }])
        await settle(20)
        resize(canvas)
        expect(frame(canvas).circles).toHaveLength(2)
      } finally {
        Object.defineProperty(globalThis, "localStorage", real)
        graph.teardownGraphs()
      }
    })
  })

  describe("the global graph dialog", () => {
    const dialogHtml = (lang: string, view = "2d") => `<button id="opener"></button>
      <dialog data-graph-dialog data-view="${view}">
        <select data-filter="folder"><option value="">All</option><option value="Books">Books</option></select>
        <select data-graph-color data-fresh-labels='{"month":"Fresh","year":"Year","older":"Old"}' data-visited-label="Seen">
          <option value="">None</option><option value="folder">Folder</option>
        </select>
        <button data-graph-3d aria-pressed="false"></button>
        <canvas data-lang="${lang}" data-current="/en-US/a"></canvas>
        <div data-graph-legend></div>
        <input type="range" data-graph-time><output data-graph-time-label></output>
      </dialog>`
    const parts = () => {
      const dialog = document.querySelector<HTMLDialogElement>("[data-graph-dialog]")!
      const canvas = dialog.querySelector("canvas")!
      Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 600 })
      Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 400 })
      return {
        dialog,
        canvas,
        color: dialog.querySelector<HTMLSelectElement>("[data-graph-color]")!,
        folder: dialog.querySelector<HTMLSelectElement>('[data-filter="folder"]')!,
        space: dialog.querySelector<HTMLButtonElement>("[data-graph-3d]")!,
        legend: dialog.querySelector<HTMLElement>("[data-graph-legend]")!,
        range: dialog.querySelector<HTMLInputElement>("[data-graph-time]")!,
        out: dialog.querySelector<HTMLOutputElement>("[data-graph-time-label]")!,
      }
    }
    const change = (el: Element) => el.dispatchEvent(new dom.window.Event("change") as unknown as Event)

    test("there is nothing to open on a page without the dialog", () => {
      document.body.innerHTML = ""
      expect(() => graph.openGraph()).not.toThrow()
    })

    test("opens with the chosen colours, a legend and a time slider", async () => {
      document.body.innerHTML = dialogHtml("cov-graph")
      const p = parts()
      p.color.value = "folder"
      graph.openGraph()
      expect(p.dialog.open).toBe(true)
      // Opening it again while open does nothing.
      graph.openGraph()
      await settle(30)
      expect(p.canvas.dataset.colorBy).toBe("folder")
      expect(p.space.getAttribute("aria-pressed")).toBe("false")
      expect([...p.legend.children].map((s) => s.textContent)).toEqual(["Books", "Notes"])
      expect(p.legend.querySelector("i")!.style.background).toBeTruthy()
      expect([p.range.min, p.range.max, p.range.value]).toEqual(["100", "300", "300"])
      resize(p.canvas)
      expect(frame(p.canvas).circles).toHaveLength(5)

      // Back in time: notes planted later hide, and the day shows in the page's language.
      document.documentElement.lang = "en-US"
      p.range.value = "200"
      p.range.dispatchEvent(new dom.window.Event("input") as unknown as Event)
      expect(p.canvas.dataset.until).toBe("200")
      expect(p.out.textContent).toBe(new Date(200 * DAY).toLocaleDateString("en-US"))
      expect(frame(p.canvas).circles).toHaveLength(4)
      // A page without a language shows the day in the browser's own, rather than failing.
      document.documentElement.lang = ""
      p.range.value = "150"
      p.range.dispatchEvent(new dom.window.Event("input") as unknown as Event)
      expect(p.out.textContent).toBe(new Date(150 * DAY).toLocaleDateString())
      p.range.value = "300"
      p.range.dispatchEvent(new dom.window.Event("input") as unknown as Event)
      expect(p.canvas.dataset.until).toBe("")
      expect(p.out.textContent).toBe("")
      expect(frame(p.canvas).circles).toHaveLength(5)

      // A filter redraws it; the slider is bound once.
      p.folder.value = "Books"
      change(p.folder)
      await settle(30)
      resize(p.canvas)
      expect(frame(p.canvas).circles).toHaveLength(3)

      // Closing stops it.
      p.dialog.close()
      expect(resizers.get(p.canvas)!.disconnected).toBe(true)
    })

    test("the 3D button switches the view and remembers it", async () => {
      document.body.innerHTML = dialogHtml("cov-graph")
      const p = parts()
      graph.openGraph()
      await settle(20)
      p.space.click()
      await settle(30)
      expect(localStorage.getItem("graphView")).toBe("3d")
      expect(p.space.getAttribute("aria-pressed")).toBe("true")
      p.space.click()
      await settle(30)
      expect(localStorage.getItem("graphView")).toBe("2d")
      expect(p.space.getAttribute("aria-pressed")).toBe("false")
      p.dialog.close()
      // Reopened, the remembered view is used, and the dialog is bound once.
      localStorage.setItem("graphView", "3d")
      graph.openGraph()
      await settle(30)
      expect(p.space.getAttribute("aria-pressed")).toBe("true")
      p.dialog.close()
    })

    test("a dialog set to 3D opens in space", async () => {
      document.body.innerHTML = dialogHtml("cov-graph", "3d")
      const p = parts()
      graph.openGraph()
      await settle(30)
      expect(p.space.getAttribute("aria-pressed")).toBe("true")
      p.dialog.close()
    })

    test("quick changes keep only the last graph, and a dialog closed while loading keeps none", async () => {
      document.body.innerHTML = dialogHtml("cov-graph")
      const p = parts()
      graph.openGraph()
      p.folder.value = "Books"
      change(p.folder)
      await settle(30)
      resize(p.canvas)
      expect(frame(p.canvas).circles).toHaveLength(3)
      // Only one graph is live on the canvas: its first observer was stopped right away.
      p.dialog.close()
      expect(resizers.get(p.canvas)!.disconnected).toBe(true)

      graph.openGraph()
      p.dialog.close()
      await settle(30)
      expect(resizers.get(p.canvas)!.disconnected).toBe(true)
    })

    test("without dates the time slider hides; without a slider nothing breaks", async () => {
      document.body.innerHTML = dialogHtml("cov-graph-undated")
      const p = parts()
      graph.openGraph()
      await settle(30)
      expect(p.range.hidden).toBe(true)
      p.dialog.close()

      document.body.innerHTML = dialogHtml("cov-graph").replace(/<input[^>]+>/, "").replace(/<select data-graph-color[\s\S]*?<\/select>/, "")
      const q = parts()
      graph.openGraph()
      await settle(30)
      expect(q.canvas.dataset.colorBy).toBe("")
      expect(q.canvas.dataset.freshLabels).toBe("{}")
      expect(q.canvas.dataset.visitedLabel).toBe("")
      q.dialog.close()
    })
  })
})
