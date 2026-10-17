import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, until, type Dom } from "./client-dom"

type Stack = typeof import("../src/scripts/stack")
let dom: Dom
let stack: Stack
let wide = true
const realFetch = globalThis.fetch
const served = new Map<string, () => Promise<Response>>()
const fetched: string[] = []
beforeAll(async () => {
  dom = installDom("https://garden.example/notes/a", {
    matchMedia: (q: string) => ({ matches: q === "(min-width: 900px)" && wide }),
  })
  globalThis.fetch = (async (url: string) => {
    fetched.push(String(url))
    const page = served.get(String(url))
    return page ? page() : new Response("missing", { status: 404 })
  }) as unknown as typeof fetch
  stack = await import("../src/scripts/stack")
  // The module keeps the root element of the document it was imported with: the shared page.
  const root = dom.document.documentElement
  root.classList.add("stacking")
  dom.document.body.innerHTML = `<div data-stack-row></div>`
  stack.setupStack(() => {})
  expect(root.classList.contains("stacking")).toBe(false)
  dom.document.body.innerHTML = ""
})
afterAll(() => {
  globalThis.fetch = realFetch
  dom.restore()
})

const column = (url: string, body: string) => () =>
  Promise.resolve(new Response(`<html><body><div data-stack-col data-url="${url}"><h1 id="title" data-astro-transition-scope="x">${body}</h1><a class="internal" href="/notes/c">C</a></div></body></html>`))
served.set("/notes/b", column("/notes/b", "B"))
served.set("/notes/c", column("/notes/c", "C"))
served.set("/notes/d", column("/notes/d", "D"))
served.set("/notes/empty", () => Promise.resolve(new Response("<p>no column here</p>")))
served.set("/notes/down", () => Promise.reject(new Error("offline")))

const root = () => dom.document.documentElement
const page = () => {
  dom.document.body.innerHTML = `<div data-stack-row><div data-stack-col data-url="/notes/a"><a class="internal" href="/notes/b">B</a><a class="internal" href="/notes/a#x">self</a>
    <a class="internal" href="https://elsewhere.example/notes/b">away</a><span>text</span></div></div>`
  return dom.document.querySelector("[data-stack-row]")!
}
const urls = (row: Element) => [...row.querySelectorAll<HTMLElement>(":scope > [data-stack-col]")].map((c) => c.dataset.url)
/** Click, and tell whether the stack took the click over; the browser's own navigation is held back either way. */
const click = (el: Element, init: MouseEventInit = {}) => {
  const e = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init })
  let heldBack = false
  const hold = (ev: Event) => {
    heldBack = !ev.defaultPrevented
    ev.preventDefault()
  }
  el.addEventListener("click", hold)
  el.dispatchEvent(e)
  el.removeEventListener("click", hold)
  return { defaultPrevented: e.defaultPrevented && !heldBack }
}

describe("stacked notes", () => {
  test("with the mode on, a link opens its note as a column to the right, kept in ?stack=", async () => {
    root().classList.add("stack-mode")
    const row = page()
    let hooked = 0
    stack.setupStack(() => hooked++)
    const e = click(row.querySelector('a[href="/notes/b"]')!)
    expect(e.defaultPrevented).toBe(true)
    await until(() => urls(row).length === 2)
    expect(urls(row)).toEqual(["/notes/a", "/notes/b"])
    const col = row.lastElementChild as HTMLElement
    expect(col.querySelector("[id]")).toBeNull()
    expect(col.querySelector("[data-astro-transition-scope]")).toBeNull()
    expect(col.querySelector(".stack-close")!.getAttribute("aria-label")).toBe("Close")
    expect(col.style.getPropertyValue("--i")).toBe("1")
    expect(dom.window.location.search).toBe("?stack=%2Fnotes%2Fb")
    expect(root().classList.contains("stacking")).toBe(true)
    expect(hooked).toBe(1)
  })

  test("a link in a column opens after it, replacing the columns to its right", async () => {
    const row = dom.document.querySelector("[data-stack-row]")!
    const b = row.lastElementChild!
    await stack.openColumn(row, b, "/notes/c", () => {})
    await stack.openColumn(row, b, "/notes/d", () => {})
    expect(urls(row)).toEqual(["/notes/a", "/notes/b", "/notes/d"])
    expect(dom.window.location.search).toBe("?stack=%2Fnotes%2Fb&stack=%2Fnotes%2Fd")
  })

  test("a column already open is scrolled to instead of opened again", async () => {
    const row = dom.document.querySelector("[data-stack-row]")!
    const d = row.lastElementChild as HTMLElement
    let scrolled = false
    d.scrollIntoView = () => void (scrolled = true)
    await stack.openColumn(row, row.firstElementChild!, "/notes/d", () => {})
    expect(scrolled).toBe(true)
    expect(urls(row)).toEqual(["/notes/a", "/notes/b", "/notes/d"])
  })

  test("closing a column closes it and those to its right", () => {
    const row = dom.document.querySelector("[data-stack-row]")!
    row.querySelector<HTMLButtonElement>('[data-url="/notes/b"] .stack-close')!.click()
    expect(urls(row)).toEqual(["/notes/a"])
    expect(dom.window.location.search).toBe("")
    expect(root().classList.contains("stacking")).toBe(false)
  })

  test("modified clicks, other buttons, links elsewhere, the page itself and plain text are left to the browser", () => {
    const row = page()
    stack.setupStack(() => {})
    const b = row.querySelector('a[href="/notes/b"]')!
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) expect([init, click(b, init).defaultPrevented]).toEqual([init, false])
    expect(click(row.querySelector('a[href="/notes/a#x"]')!).defaultPrevented).toBe(false)
    expect(click(row.querySelector('a[href^="https://elsewhere"]')!).defaultPrevented).toBe(false)
    expect(click(row.querySelector("span")!).defaultPrevented).toBe(false)
    root().classList.remove("stack-mode")
    expect(click(b).defaultPrevented).toBe(false)
    root().classList.add("stack-mode")
    wide = false
    expect(click(b).defaultPrevented).toBe(false)
    wide = true
  })

  test("a row is bound once; a page without one is left alone", () => {
    const row = page()
    stack.setupStack(() => {})
    stack.setupStack(() => {})
    const before = fetched.length
    click(row.querySelector('a[href="/notes/b"]')!)
    expect(fetched.length).toBe(before)
    dom.document.body.innerHTML = ""
    expect(() => stack.setupStack(() => {})).not.toThrow()
  })

  test("a shared ?stack= opens its columns in order, on a wide screen in stack mode only", async () => {
    dom.window.history.replaceState(null, "", "/notes/a?stack=%2Fnotes%2Fb&stack=%2Fnotes%2Fc")
    let row = page()
    stack.setupStack(() => {})
    await until(() => urls(row).length === 3)
    expect(urls(row)).toEqual(["/notes/a", "/notes/b", "/notes/c"])
    dom.window.history.replaceState(null, "", "/notes/a?stack=%2Fnotes%2Fb")
    root().classList.remove("stack-mode")
    row = page()
    stack.setupStack(() => {})
    await new Promise((r) => setTimeout(r, 20))
    expect(urls(row)).toEqual(["/notes/a"])
    root().classList.add("stack-mode")
  })

  test("a page with no column to offer is opened in full; a malformed address is ignored", async () => {
    const row = page()
    const realLocation = globalThis.location
    const fake = { origin: "https://garden.example", href: "https://garden.example/notes/a" }
    Object.defineProperty(globalThis, "location", { value: fake, configurable: true, writable: true })
    try {
      await stack.openColumn(row, row.firstElementChild!, "/notes/empty", () => {})
      expect(fake.href).toBe("/notes/empty")
      await stack.openColumn(row, row.firstElementChild!, "/notes/down", () => {})
      expect(fake.href).toBe("/notes/down")
      await stack.openColumn(row, row.firstElementChild!, "/notes/gone", () => {})
      expect(fake.href).toBe("/notes/gone")
      const before = fetched.length
      await stack.openColumn(row, row.firstElementChild!, "http://[", () => {})
      expect(fetched.length).toBe(before)
      expect(fake.href).toBe("/notes/gone")
    } finally {
      Object.defineProperty(globalThis, "location", { value: realLocation, configurable: true, writable: true })
    }
    expect(urls(row)).toEqual(["/notes/a"])
  })
})
