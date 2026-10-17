/**
 * A happy-dom page installed as the global DOM for client scripts, and undone
 * afterwards, so the other test files of the same bun process are unaffected.
 */
import { Window } from "happy-dom"

export type DomWindow = globalThis.Window & typeof globalThis

const KEYS = [
  "window",
  "document",
  "location",
  "history",
  "navigator",
  "sessionStorage",
  "localStorage",
  "matchMedia",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "innerWidth",
  "innerHeight",
  "scrollY",
  "CSS",
  "DOMParser",
  "Node",
  "NodeFilter",
  "Text",
  "Element",
  "HTMLElement",
  "HTMLAnchorElement",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
  "FontFace",
] as const

export interface Dom {
  window: DomWindow
  document: Document
  /** Put the globals back as they were. */
  restore(): void
}

/** Install a fresh page at `url` as the global DOM; `extra` adds or overrides globals. */
export function installDom(url: string, extra: Record<string, unknown> = {}): Dom {
  const happy = new Window({ url })
  const window = happy as unknown as DomWindow
  const g = globalThis as unknown as Record<string, unknown>
  const names = [...new Set([...KEYS, ...Object.keys(extra)])]
  const saved = new Map(names.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  const w = window as unknown as Record<string, unknown>
  for (const k of KEYS) {
    const v = w[k]
    Object.defineProperty(globalThis, k, { value: typeof v === "function" && /^[a-z]/.test(k) ? v.bind(window) : v, writable: true, configurable: true })
  }
  Object.defineProperty(globalThis, "window", { value: window, writable: true, configurable: true })
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true })
  return {
    window,
    document: window.document,
    restore() {
      for (const [k, d] of saved) {
        if (d) Object.defineProperty(globalThis, k, d)
        else delete g[k]
      }
    },
  }
}

let n = 0
/**
 * A fresh instance of a module, so its top-level code runs against the DOM installed now.
 * Coverage only counts the shared instance, so prefer `sharedOrFresh`.
 */
export function fresh<T>(path: string): Promise<T> {
  return import(`${path}?cov=${++n}`) as Promise<T>
}

/**
 * The shared instance of a module that binds listeners to the document once
 * (at import, or on its first setup), as long as it is bound to the page
 * installed now. When another test file of the same bun process bound it to
 * its own page first, a fresh instance stands in, bound to this one: the
 * tests still run, though only the shared instance counts for coverage.
 * `onThisPage` tells, by trying it, whether the instance answers this page.
 */
export async function sharedOrFresh<T>(path: string, onThisPage: (m: T) => boolean | Promise<boolean>): Promise<T> {
  const shared = (await import(path)) as T
  if (await onThisPage(shared)) return shared
  const copy = await fresh<T>(path)
  if (!(await onThisPage(copy))) throw new Error(`${path} does not answer the page under test`)
  return copy
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

/** Wait until `cond` holds, polling for up to a second. */
export async function until(cond: () => unknown, tries = 100): Promise<void> {
  for (let i = 0; i < tries && !cond(); i++) await tick(10)
}
