import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { getVault, type FolderNode, type Note } from "../src/lib/vault"
import { explorerTree, trail } from "../src/lib/explorer"
import { installDom, until, type Dom } from "./client-dom"

const tree = getVault().trees["vi-VN"]

/** The deepest note of the tree, with the folders holding it. */
function deepest(f: FolderNode, path: FolderNode[] = []): { note: Note; folders: FolderNode[] } | undefined {
  let best: { note: Note; folders: FolderNode[] } | undefined
  for (const c of f.folders) {
    const d = deepest(c, [...path, c])
    if (d && (!best || d.folders.length > best.folders.length)) best = d
  }
  if (!best && f.notes.length && path.length) best = { note: f.notes[0], folders: path }
  return best
}
const allNotes = (f: FolderNode): Note[] => [...f.notes, ...f.folders.flatMap(allNotes)]
const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])

describe("the explorer's tree on the server", () => {
  const { note, folders } = deepest(tree)!
  const outside = tree.folders.find((f) => f !== folders[0] && f.notes.length > 0)!

  test("the whole tree lists every note and folder, nothing marked or open", () => {
    const html = explorerTree(tree)
    expect(links(html)).toEqual(expect.arrayContaining([...allNotes(tree).map((n) => n.url), ...tree.folders.map((f) => f.url)]))
    expect(html).not.toContain("aria-current")
    expect(html).not.toContain(" open>")
  })

  test("a page's part holds the top level and its own folders, opened, with the page marked", () => {
    expect([...trail(tree, note.url + "/")]).toEqual(folders.map((f) => f.dir))
    const html = explorerTree(tree, { open: trail(tree, note.url), current: note.url })
    for (const f of folders) expect(html).toContain(`<details data-dir="${f.dir}" open>`)
    expect(html).toContain(`<a href="${note.url}" title="${note.title}" aria-current="page">`)
    expect(html.match(/aria-current/g)).toHaveLength(1)
    // Other folders show, empty until the whole tree arrives.
    expect(html).toContain(`<details data-dir="${outside.dir}"><summary`)
    for (const n of allNotes(outside)) expect(links(html)).not.toContain(n.url)
    expect(html.length).toBeLessThan(explorerTree(tree).length)
  })

  test("a folder's own page opens its folder, and a page outside the tree opens none", () => {
    const f = folders[0]
    expect([...trail(tree, f.url)]).toEqual([f.dir])
    expect(explorerTree(tree, { open: trail(tree, f.url), current: f.url })).toContain(`<a class="folder-link" href="${f.url}" aria-current="page">`)
    expect(trail(tree, "/tags").size).toBe(0)
  })
})

describe("the explorer in the browser", () => {
  let dom: Dom
  let explorer: typeof import("../src/scripts/explorer")
  const full = `<ul><li class="folder"><details data-dir="A"><summary aria-label="A"></summary><ul><li><a href="/A/one" title="One">One</a></li><li class="folder"><details data-dir="A/B"><summary aria-label="B"></summary><ul><li><a href="/A/B/two" title="Two">Two</a></li></ul></details><a class="folder-link" href="/A/B">B</a></li></ul></details><a class="folder-link" href="/A">A</a></li><li class="folder"><details data-dir="C"><summary aria-label="C"></summary><ul><li><a href="/C/three" title="Three">Three</a></li></ul></details><a class="folder-link" href="/C">C</a></li><li><a href="/top" title="Top">Top</a></li></ul>`
  const part = `<ul><li class="folder"><details data-dir="A" open><summary aria-label="A"></summary><ul><li><a href="/A/one" title="One">One</a></li><li class="folder"><details data-dir="A/B" open><summary aria-label="B"></summary><ul><li><a href="/A/B/two" title="Two" aria-current="page">Two</a></li></ul></details><a class="folder-link" href="/A/B">B</a></li></ul></details><a class="folder-link" href="/A">A</a></li><li class="folder"><details data-dir="C"><summary aria-label="C"></summary><ul></ul></details><a class="folder-link" href="/C">C</a></li><li><a href="/top" title="Top">Top</a></li></ul>`
  let fetched: string[] = []

  beforeAll(async () => {
    dom = installDom("https://garden.example/A/B/two")
    dom.set("fetch", async (url: string) => {
      fetched.push(url)
      return new Response(full)
    })
    explorer = await import("../src/scripts/explorer")
  })
  afterAll(() => dom.restore())

  // Each test loads its own language: the tree of one is fetched once.
  const mount = (lang = "en-US") => {
    document.body.innerHTML = `<aside><div class="explorer" data-explorer="${lang}" data-explorer-partial>${part}</div></aside>`
    return document.querySelector<HTMLElement>("[data-explorer]")!
  }

  test("the whole tree takes the part's place, with the page marked and its folders and the remembered ones open", async () => {
    fetched = []
    localStorage.setItem("explorer-open", JSON.stringify(["C"]))
    const el = mount()
    await explorer.ensureExplorer()
    expect(fetched).toEqual(["/static/explorer.en-US.html"])
    expect(el.hasAttribute("data-explorer-partial")).toBe(false)
    expect(el.querySelector("a[href='/C/three']")).not.toBeNull()
    expect(el.querySelector("[aria-current]")?.getAttribute("href")).toBe("/A/B/two")
    const open = [...el.querySelectorAll<HTMLDetailsElement>("details")].filter((d) => d.open).map((d) => d.dataset.dir)
    expect(open.sort()).toEqual(["A", "A/B", "C"])
    // Loaded once: a second call has nothing to do.
    await explorer.ensureExplorer()
    expect(fetched).toHaveLength(1)
  })

  test("focus stays on the link it was on, and toggling a folder is remembered", async () => {
    localStorage.clear()
    const el = mount("vi-VN")
    el.querySelector<HTMLElement>("a[href='/top']")!.focus()
    await explorer.ensureExplorer()
    expect(document.activeElement?.getAttribute("href")).toBe("/top")
    const c = el.querySelector<HTMLDetailsElement>("details[data-dir='C']")!
    c.open = true
    c.dispatchEvent(new dom.window.Event("toggle") as unknown as Event)
    expect(JSON.parse(localStorage.getItem("explorer-open")!)).toContain("C")
  })

  test("offline, the part stays as it is", async () => {
    dom.set("fetch", async () => {
      throw new Error("offline")
    })
    const el = mount("de-DE")
    await explorer.ensureExplorer()
    expect(el.hasAttribute("data-explorer-partial")).toBe(true)
    expect(el.querySelector("[aria-current]")?.getAttribute("href")).toBe("/A/B/two")
  })

  const online = () =>
    dom.set("fetch", async (url: string) => {
      fetched.push(url)
      return new Response(full)
    })
  const pageLoad = () => document.dispatchEvent(new dom.window.Event("astro:page-load") as unknown as Event)
  const openDirs = (el: HTMLElement) => [...el.querySelectorAll<HTMLDetailsElement>("details")].filter((d) => d.open).map((d) => d.dataset.dir)

  test("focus on a folder's toggle stays on that folder's toggle", async () => {
    online()
    const el = mount("nl-NL")
    el.querySelector<HTMLElement>("details[data-dir='C'] > summary")!.focus()
    await explorer.ensureExplorer()
    expect(el.hasAttribute("data-explorer-partial")).toBe(false)
    expect(document.activeElement).toBe(el.querySelector("details[data-dir='C'] > summary"))
  })

  test("remembered folders that cannot be read open none, only the page's own", async () => {
    online()
    localStorage.setItem("explorer-open", "{not json")
    const el = mount("fr-FR")
    await explorer.ensureExplorer()
    expect(el.hasAttribute("data-explorer-partial")).toBe(false)
    expect(openDirs(el).sort()).toEqual(["A", "A/B"])
  })

  test("the tree loads once the sidebar comes on screen, and then the browser is idle", async () => {
    online()
    fetched = []
    const observers: { callback: (entries: { isIntersecting: boolean }[]) => void; observed: Element[]; disconnected: boolean }[] = []
    dom.set(
      "IntersectionObserver",
      class {
        observed: Element[] = []
        disconnected = false
        constructor(public callback: (entries: { isIntersecting: boolean }[]) => void) {
          observers.push(this)
        }
        observe(el: Element) {
          this.observed.push(el)
        }
        disconnect() {
          this.disconnected = true
        }
      },
    )
    // A page without a partial explorer sets nothing up.
    document.body.innerHTML = ""
    pageLoad()
    expect(observers).toHaveLength(0)

    const el = mount("ja-JP")
    pageLoad()
    expect(observers).toHaveLength(1)
    expect(observers[0].observed).toEqual([el])
    // Out of sight, as in a closed drawer: nothing loads.
    observers[0].callback([{ isIntersecting: false }])
    expect(observers[0].disconnected).toBe(false)
    expect(fetched).toHaveLength(0)
    // Another page load drops the old observer for a new one.
    pageLoad()
    expect(observers[0].disconnected).toBe(true)
    expect(observers).toHaveLength(2)
    observers[1].callback([{ isIntersecting: false }, { isIntersecting: true }])
    expect(observers[1].disconnected).toBe(true)
    // happy-dom has no requestIdleCallback: a short timer stands in.
    expect(el.hasAttribute("data-explorer-partial")).toBe(true)
    await until(() => !el.hasAttribute("data-explorer-partial"))
    expect(fetched).toEqual(["/static/explorer.ja-JP.html"])
  })

  test("reaching for the part loads the whole tree at once: a pointer over it, or a folder opened empty", async () => {
    online()
    fetched = []
    const hovered = mount("it-IT")
    document.body.dispatchEvent(new dom.window.Event("pointerover", { bubbles: true }) as unknown as Event)
    expect(fetched).toHaveLength(0)
    hovered.querySelector("a")!.dispatchEvent(new dom.window.Event("pointerover", { bubbles: true }) as unknown as Event)
    await until(() => !hovered.hasAttribute("data-explorer-partial"))
    expect(fetched).toEqual(["/static/explorer.it-IT.html"])

    const el = mount("pt-BR")
    const toggle = (dir: string, open: boolean) => {
      const d = el.querySelector<HTMLDetailsElement>(`details[data-dir='${dir}']`)!
      d.open = open
      d.dispatchEvent(new dom.window.Event("toggle") as unknown as Event)
    }
    // Closing a folder, or opening one that already holds its notes, asks for nothing.
    toggle("A", false)
    toggle("A", true)
    expect(fetched).toHaveLength(1)
    toggle("C", true)
    await until(() => !el.hasAttribute("data-explorer-partial"))
    expect(fetched).toEqual(["/static/explorer.it-IT.html", "/static/explorer.pt-BR.html"])
  })

  test("without IntersectionObserver the tree loads when the browser is idle", async () => {
    online()
    fetched = []
    const idle: number[] = []
    // A window that has neither observer: requestIdleCallback is how the script waits.
    dom.set("window", { requestIdleCallback: true })
    dom.set("requestIdleCallback", (fn: () => void, opts: { timeout: number }) => {
      idle.push(opts.timeout)
      fn()
    })
    try {
      const el = mount("es-ES")
      pageLoad()
      expect(idle).toEqual([3000])
      await until(() => !el.hasAttribute("data-explorer-partial"))
      expect(fetched).toEqual(["/static/explorer.es-ES.html"])
    } finally {
      dom.set("window", dom.window)
    }
  })
})
