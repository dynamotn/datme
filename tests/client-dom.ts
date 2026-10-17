/**
 * A happy-dom browser installed on globalThis for tests of client scripts,
 * and taken away again so other test files see the globals they started with.
 *
 * Every test file using it shares one window: the whole suite runs in one bun
 * process with one module cache, and scripts bind some listeners to the
 * document once, on first use. With one shared document those listeners keep
 * working whichever test file happens to set them up first.
 */
import { Window } from "happy-dom"

export type DomWindow = globalThis.Window & typeof globalThis

/** Classes and objects copied from the window as they are. */
const PLAIN = [
  "window",
  "document",
  "location",
  "navigator",
  "history",
  "localStorage",
  "sessionStorage",
  "Node",
  "Element",
  "Text",
  "HTMLElement",
  "HTMLMediaElement",
  "HTMLVideoElement",
  "HTMLCanvasElement",
  "HTMLDialogElement",
  "NodeFilter",
  "DOMParser",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "MutationObserver",
  "IntersectionObserver",
  "ResizeObserver",
] as const

/** Functions of the window, called without it. */
const BOUND = ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "scrollTo", "addEventListener", "removeEventListener"] as const

/** Live values read off the window, like `scrollY`. */
const LIVE = ["innerHeight", "innerWidth", "scrollY"] as const

export interface Dom {
  window: DomWindow
  /** Move the page to another URL, keeping its document. */
  goto(url: string): void
  /** Put a global in place until restore (a fake observer, a clipboard...). */
  set(name: string, value: unknown): void
  restore(): void
}

const SHARED = Symbol.for("datme.tests.client-dom")

function sharedWindow(): Window {
  const g = globalThis as unknown as Record<symbol, Window | undefined>
  return (g[SHARED] ??= new Window({ url: "https://garden.example/", width: 1024, height: 768 }))
}

/** Leave the shared page blank for the next test file. */
function clean(happy: Window) {
  const root = happy.document.documentElement
  for (const a of [...root.attributes]) root.removeAttribute(a.name)
  happy.document.head.innerHTML = ""
  happy.document.body.innerHTML = ""
  for (const a of [...happy.document.body.attributes]) happy.document.body.removeAttribute(a.name)
  happy.localStorage.clear()
  happy.sessionStorage.clear()
}

export function installDom(url = "https://garden.example/"): Dom {
  const happy = sharedWindow()
  happy.happyDOM.setURL(url)
  clean(happy)
  const window = happy as unknown as DomWindow
  const g = globalThis as unknown as Record<string, unknown>
  const saved = new Map<string, PropertyDescriptor | undefined>()
  const put = (name: string, desc: PropertyDescriptor) => {
    if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, ...desc })
  }
  const w = window as unknown as Record<string, unknown>
  for (const k of PLAIN) put(k, { value: w[k], writable: true })
  for (const k of BOUND) put(k, { value: (w[k] as (...a: unknown[]) => unknown).bind(window), writable: true })
  for (const k of LIVE) put(k, { get: () => w[k] })
  return {
    window,
    goto: (url) => happy.happyDOM.setURL(url),
    set: (name, value) => put(name, { value, writable: true }),
    restore() {
      for (const [name, desc] of saved) {
        if (desc) Object.defineProperty(globalThis, name, desc)
        else delete g[name]
      }
      saved.clear()
      clean(happy)
    },
  }
}

/** Let promises and short timers settle. */
export const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms))

