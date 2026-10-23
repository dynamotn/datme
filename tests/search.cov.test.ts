import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { installDom, settle, until, type Dom } from "./client-dom"
import { model } from "./cov-transformers"
import { quantize } from "../src/lib/vectors"

const navigated: string[] = []
mock.module("astro:transitions/client", () => ({ navigate: (url: string) => void navigated.push(url) }))

// Pagefind's script, as the build writes it next to the site.
const pagefindAsked: { q: string | null; filters?: Record<string, string> }[] = []
const pagefindOptions: { baseUrl: string }[] = []
const pagefindPages: Record<string, { url: string; excerpt: string; meta: { title?: string } }[]> = {
  slip: [
    { url: "/notes/a", excerpt: "the <mark>slip</mark> box", meta: { title: "Slip box" } },
    { url: "/notes/untitled", excerpt: "no title", meta: {} },
  ],
}
mock.module("https://garden.example/pagefind/pagefind.js", () => ({
  async options(o: { baseUrl: string }) {
    pagefindOptions.push(o)
  },
  async search(q: string | null, opts?: { filters?: Record<string, string> }) {
    pagefindAsked.push({ q, filters: opts?.filters })
    if (q === "slow") await settle(150)
    const hits = q === null ? pagefindPages.slip.slice(0, 1) : (pagefindPages[q] ?? [])
    return { results: hits.map((h) => ({ data: async () => h })) }
  },
}))

type Search = typeof import("../src/scripts/search")
let dom: Dom
let search: Search
const realFetch = globalThis.fetch
const note = (u: string, t: string, more: Record<string, unknown> = {}) => ({
  u,
  t,
  a: [],
  g: [],
  p: "",
  y: [],
  s: null,
  f: "",
  d: `About ${t}`,
  c: "",
  ...more,
})
const index = {
  notes: [
    note("/notes/a", "Slip box", { g: ["pkm/zettel", "method"], p: "Notes", f: "Notes", s: "🌱", a: ["Zettelkasten"] }),
    note("/notes/b", "Slip cards", { p: "Notes", y: ["book"], c: "Cards of the slip box, in a drawer." }),
    note("/notes/c", "Cooking", { g: ["food"], p: "Kitchen" }),
    note("/notes/d", "Food science", { g: ["food/science"], p: "Kitchen" }),
  ],
  links: [],
}
const vectors = {
  model: "fake",
  dims: 2,
  notes: [
    { u: "/notes/a", v: quantize([1, 0]) },
    { u: "/notes/b", v: quantize([0.95, 0.3]) },
    { u: "/notes/c", v: quantize([0, 1]) },
    { u: "/notes/d", v: quantize([0.3, 0.95]) },
    { u: "/notes/gone", v: quantize([0.99, 0.1]) },
  ],
}
beforeAll(async () => {
  dom = installDom("https://garden.example/notes/a")
  globalThis.fetch = (async (url: string) => {
    const u = String(url)
    if (u.includes("vectors.cov-novec")) return new Response("missing", { status: 404 })
    return new Response(JSON.stringify(u.includes("vectors") ? vectors : index))
  }) as unknown as typeof fetch
  search = await import("../src/scripts/search")
})
afterAll(() => {
  globalThis.fetch = realFetch
  dom.restore()
})

interface Opts {
  lang?: string
  engine?: string
  similar?: boolean
  model?: boolean
  filters?: boolean
}
function make({ lang = "cov-search", engine = "minisearch", similar = false, model = false, filters = false }: Opts = {}) {
  dom.document.body.innerHTML = `<dialog data-search-dialog data-lang="${lang}" data-engine="${engine}" ${similar ? `data-similar="Like this one"` : ""} ${model ? `data-model="fake-model"` : ""}>
    <input type="search">
    ${model ? `<button data-search-meaning aria-pressed="false" data-loading="Loading…"><span>By meaning</span></button>` : ""}
    ${filters ? `<select data-filter="folder"><option value="">All</option><option value="Notes">Notes</option><option value="Kitchen">Kitchen</option></select><select data-filter="type"><option value="">All</option><option value="book">Book</option></select>` : ""}
    <ul class="search-results" data-empty="Nothing found"></ul></dialog>`
  const dialog = dom.document.querySelector("dialog") as HTMLDialogElement
  search.setupSearch()
  return { dialog, input: dialog.querySelector("input")!, list: dialog.querySelector<HTMLElement>(".search-results")! }
}
const hrefs = (list: Element) => [...list.querySelectorAll("a")].map((a) => a.getAttribute("href"))
const type = (input: HTMLInputElement, q: string) => {
  input.value = q
  input.dispatchEvent(new dom.window.Event("input"))
}
const key = (el: Element, k: string) => {
  const e = new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })
  el.dispatchEvent(e)
  return e
}
/** Wait for the results to settle on something other than what they were. */
const settled = async (list: Element, before = list.innerHTML) => {
  await until(() => list.innerHTML !== before)
  await settle(20)
}

describe("searching with the built-in index", () => {
  test("typing finds notes by title, folder, tags and the words around the match", async () => {
    const { input, list } = make()
    type(input, "slip")
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/b", "/notes/a"])
    const [cards, box] = list.querySelectorAll("a")
    expect(box.querySelector(".r-title")!.innerHTML).toBe("<span>🌱</span><mark>Slip</mark> box")
    expect(box.querySelector(".r-path")!.textContent).toBe("Notes · #pkm/zettel · #method")
    // A note without a stage gets the plain icon; its snippet comes from its content.
    expect(cards.querySelector(".r-title span")!.textContent).toBe("📝")
    expect(cards.querySelector(".r-snippet")!.innerHTML).toContain("<mark>slip</mark> box")
    expect(input.getAttribute("aria-activedescendant")).toBe("search-option-0")
  })

  test("arrow keys move the selection round the results; Enter opens the selected one", async () => {
    const { dialog, input, list } = make()
    dialog.showModal()
    type(input, "slip")
    await settled(list)
    expect(key(input, "ArrowDown").defaultPrevented).toBe(true)
    expect(input.getAttribute("aria-activedescendant")).toBe("search-option-1")
    key(input, "ArrowDown")
    expect(input.getAttribute("aria-activedescendant")).toBe("search-option-0")
    key(input, "ArrowUp")
    expect(list.querySelectorAll("a")[1].getAttribute("aria-selected")).toBe("true")
    expect(key(input, "Tab").defaultPrevented).toBe(false)
    navigated.length = 0
    expect(key(input, "Enter").defaultPrevented).toBe(true)
    expect(navigated).toEqual(["/notes/a"])
    expect(dialog.open).toBe(false)
  })

  test("Enter with no results does nothing; nothing found says so", async () => {
    const { input, list } = make()
    type(input, "zzzz")
    await settled(list)
    expect(list.querySelector(".empty")!.textContent).toBe("Nothing found")
    expect(input.getAttribute("aria-expanded")).toBe("false")
    expect(input.hasAttribute("aria-activedescendant")).toBe(false)
    expect(key(input, "Enter").defaultPrevented).toBe(false)
  })

  test("a query starting with # finds notes by tag, nested tags too", async () => {
    const { input, list } = make()
    type(input, "#food")
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/c", "/notes/d"])
  })

  test("filters alone browse every matching note; clearing everything clears the results", async () => {
    const { input, list, dialog } = make({ filters: true })
    const folder = dialog.querySelector<HTMLSelectElement>('select[data-filter="folder"]')!
    folder.value = "Kitchen"
    folder.dispatchEvent(new dom.window.Event("change"))
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/c", "/notes/d"])
    folder.value = ""
    const type_ = dialog.querySelector<HTMLSelectElement>('select[data-filter="type"]')!
    type_.value = "book"
    type_.dispatchEvent(new dom.window.Event("change"))
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/b"])
    type_.value = ""
    type(input, "  ")
    await settled(list)
    expect(list.innerHTML).toBe("")
  })

  test("a click on a result, or on the backdrop, closes the dialog; Esc does too, unless already handled", async () => {
    const { dialog, input, list } = make()
    type(input, "slip")
    await settled(list)
    dialog.showModal()
    list.querySelector("a")!.addEventListener("click", (e) => e.preventDefault())
    list.querySelector("a")!.click()
    expect(dialog.open).toBe(false)
    dialog.showModal()
    list.click()
    expect(dialog.open).toBe(true)
    dialog.click()
    expect(dialog.open).toBe(false)
    dialog.showModal()
    const handled = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    handled.preventDefault()
    input.dispatchEvent(handled)
    expect(dialog.open).toBe(true)
    key(input, "x")
    expect(dialog.open).toBe(true)
    key(input, "Escape")
    expect(dialog.open).toBe(false)
  })

  test("a dialog is bound once, and a page without one is left alone", async () => {
    const { input, list } = make()
    search.setupSearch()
    dom.document.body.dataset.x = ""
    type(input, "slip")
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/b", "/notes/a"])
    dom.document.body.innerHTML = ""
    expect(() => search.setupSearch()).not.toThrow()
    expect(() => search.openSearch()).not.toThrow()
  })
})

describe("notes like this one", () => {
  test("opening the dialog on a note with nothing typed lists the notes closest in meaning", async () => {
    const { dialog, list } = make({ similar: true })
    search.openSearch()
    expect(dialog.open).toBe(true)
    await settled(list, "")
    expect(list.querySelector(".group")!.textContent).toBe("Like this one")
    // The note itself is left out, and so is a vector of a note the index no longer has.
    expect(hrefs(list)).toEqual(["/notes/b"])
    // Opening an open dialog changes nothing.
    search.openSearch()
    expect(dialog.open).toBe(true)
  })

  test("with nothing typed and no vectors, or on a page that is no note, nothing is listed", async () => {
    let { list } = make({ similar: true, lang: "cov-novec" })
    search.openSearch()
    await settle(80)
    expect(list.innerHTML).toBe("")
    dom.window.history.replaceState(null, "", "/tags")
    ;({ list } = make({ similar: true }))
    search.openSearch()
    await settle(80)
    expect(list.innerHTML).toBe("")
    dom.window.history.replaceState(null, "", "/notes/c")
    ;({ list } = make({ similar: true }))
    search.openSearch()
    await settled(list, "")
    // Nothing close enough to Cooking but Food science.
    expect(hrefs(list)).toEqual(["/notes/d"])
    dom.window.history.replaceState(null, "", "/notes/x")
    ;({ list } = make({ similar: true, lang: "cov-search" }))
    search.openSearch()
    await settle(80)
    expect(list.innerHTML).toBe("")
    dom.window.history.replaceState(null, "", "/notes/a")
  })

  test("without data-lang, the page's language is used", async () => {
    const { dialog, input, list } = make()
    dialog.removeAttribute("data-lang")
    dom.document.documentElement.dataset.lang = "cov-search"
    type(input, "cooking")
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/c"])
    search.openSearch()
    expect(dialog.open).toBe(true)
  })
})

describe("searching by meaning", () => {
  test("a failed download or query leaves the toggle off and says why on the console", async () => {
    const { dialog, input, list } = make({ model: true })
    const toggle = dialog.querySelector<HTMLButtonElement>("[data-search-meaning]")!
    const warn = console.warn
    const warned: unknown[] = []
    console.warn = (...a: unknown[]) => void warned.push(a[0])
    // A model downloaded by an earlier test file is kept: then its first query fails instead.
    model.failNext = true
    model.failQuery = true
    try {
      type(input, "slip")
      await settled(list)
      toggle.click()
      await until(() => !toggle.hasAttribute("aria-busy"))
      await settle(20)
      expect(toggle.getAttribute("aria-pressed")).toBe("false")
      expect(warned).toEqual(["[datme] search by meaning is unavailable:"])
      expect(dom.document.activeElement).toBe(input)
      expect(hrefs(list)).toEqual(["/notes/b", "/notes/a"])
      // A toggle that is on turns off at once, and searches again by the words.
      toggle.setAttribute("aria-pressed", "true")
      list.innerHTML = ""
      toggle.click()
      expect(toggle.getAttribute("aria-pressed")).toBe("false")
      await settled(list, "")
      expect(hrefs(list)).toEqual(["/notes/b", "/notes/a"])
    } finally {
      console.warn = warn
      model.failNext = false
      model.failQuery = false
    }
  })

  test("the toggle downloads the model once, then queries blend words and meaning", async () => {
    const { dialog, input, list } = make({ model: true })
    const toggle = dialog.querySelector<HTMLButtonElement>("[data-search-meaning]")!
    type(input, "cooking")
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/c"])
    const before = list.innerHTML
    toggle.click()
    expect(toggle.getAttribute("aria-busy")).toBe("true")
    expect(toggle.querySelector("span")!.textContent).toBe("Loading…")
    // A click while it loads is ignored.
    toggle.click()
    await settled(list, before)
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
    expect(toggle.hasAttribute("aria-busy")).toBe(false)
    expect(toggle.querySelector("span")!.textContent).toBe("By meaning")
    // Cooking by its words, Food science by its meaning, with how close it is.
    expect(hrefs(list)).toEqual(["/notes/c", "/notes/d"])
    expect(list.querySelector(".r-sim")!.textContent).toMatch(/^≈ \d+%$/)
    // A note found by meaning alone still shows when the words find nothing.
    type(input, "cook food")
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/c", "/notes/d"])
    // )
  })

  test("without vectors, meaning adds nothing; without a model there is no toggle to set up", async () => {
    const { dialog, input, list } = make({ model: true, lang: "cov-novec" })
    const toggle = dialog.querySelector<HTMLButtonElement>("[data-search-meaning]")!
    toggle.setAttribute("aria-pressed", "true")
    type(input, "slip")
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/b", "/notes/a"])
    // A toggle without a model to load stays a plain button.
    dom.document.body.innerHTML = `<dialog data-search-dialog data-lang="cov-search" data-engine="minisearch"><input><button data-search-meaning aria-pressed="true"><span>m</span></button><ul class="search-results"></ul></dialog>`
    search.setupSearch()
    const plain = dom.document.querySelector<HTMLInputElement>("input")!
    const l = dom.document.querySelector(".search-results")!
    type(plain, "food")
    await settled(l)
    expect(hrefs(l)).toEqual(["/notes/d", "/notes/c"])
    expect(l.querySelector(".r-sim")).toBeNull()
  })
})

describe("searching with Pagefind", () => {
  test("a query runs through Pagefind, its excerpts shown as they come", async () => {
    const { input, list } = make({ engine: "pagefind", lang: "cov-pf" })
    search.openSearch()
    type(input, "slip")
    await settled(list)
    expect(hrefs(list)).toEqual(["/notes/a", "/notes/untitled"])
    expect(list.querySelector(".r-snippet")!.innerHTML).toBe("the <mark>slip</mark> box")
    expect(list.querySelectorAll(".r-title")[1].textContent).toBe("📝/notes/untitled")
    expect(pagefindAsked.at(-1)).toEqual({ q: "slip", filters: {} })
    // Its result URLs are paths from the site's root: the site's path goes in front.
    expect(pagefindOptions).toEqual([{ baseUrl: "/" }])
  })

  test("filters go to Pagefind, even with nothing typed; nothing found says so", async () => {
    const { dialog, input, list } = make({ engine: "pagefind", lang: "cov-pf", filters: true })
    const folder = dialog.querySelector<HTMLSelectElement>('select[data-filter="folder"]')!
    const kind = dialog.querySelector<HTMLSelectElement>('select[data-filter="type"]')!
    folder.value = "Notes"
    kind.value = "book"
    folder.dispatchEvent(new dom.window.Event("change"))
    await settled(list)
    expect(pagefindAsked.at(-1)).toEqual({ q: null, filters: { folder: "Notes", type: "book" } })
    expect(hrefs(list)).toEqual(["/notes/a"])
    folder.value = ""
    kind.value = ""
    type(input, "nothing")
    await settled(list)
    expect(list.querySelector(".empty")!.textContent).toBe("Nothing found")
    type(input, "")
    await settled(list)
    expect(list.innerHTML).toBe("")
  })

  test("a slower answer to an older query never replaces a newer one", async () => {
    const { input, list } = make({ engine: "pagefind", lang: "cov-pf" })
    type(input, "slow")
    await settle(80)
    type(input, "slip")
    await settle(300)
    expect(hrefs(list)).toEqual(["/notes/a", "/notes/untitled"])
  })

  test("opened on a note with nothing typed, Pagefind sites still list notes like this one", async () => {
    const { list } = make({ engine: "pagefind", lang: "cov-pf", similar: true })
    search.openSearch()
    await settled(list, "")
    expect(hrefs(list)).toEqual(["/notes/b"])
  })

  test("notes like this one that arrive after a newer query are dropped", async () => {
    const { input, list } = make({ engine: "pagefind", lang: "cov-pf-late", similar: true })
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const fetchNow = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes("vectors.cov-pf-late")) await gate
      return fetchNow(url)
    }) as unknown as typeof fetch
    try {
      search.openSearch()
      type(input, "slip")
      await settled(list)
      release()
      await settle(50)
      expect(hrefs(list)).toEqual(["/notes/a", "/notes/untitled"])
    } finally {
      globalThis.fetch = fetchNow
    }
  })
})
