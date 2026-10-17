import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"
import type { Highlight, PageHighlights } from "../src/scripts/highlights"

type Highlights = typeof import("../src/scripts/highlights")
const KEY = "datme:highlights:"
const HERE = "/en-US/note"

describe("reader highlights in the browser", () => {
  let dom: Dom
  let hl: Highlights
  beforeAll(async () => {
    dom = installDom("https://garden.example/en-US/note")
    hl = await import("../src/scripts/highlights")
  })
  afterEach(() => {
    localStorage.clear()
    document.querySelectorAll("dialog").forEach((d) => d.remove())
    document.getSelection()?.removeAllRanges()
  })
  afterAll(() => dom.restore())

  const note = (html = `<p>A note <em>links to</em> another note.</p><p>Second line.</p>`) =>
    (document.body.innerHTML = `<div class="stack-col" data-title="The note"><article class="note"><div class="prose">${html}</div></article></div><p id="outside">outside text</p>`)
  const prose = () => document.querySelector(".prose")!
  const select = (startNode: Node, startOffset: number, endNode: Node, endOffset: number) => {
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    const sel = document.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
  }
  const page = (path = HERE): PageHighlights => JSON.parse(localStorage.getItem(KEY + path)!)
  const store = (path: string, p: PageHighlights) => localStorage.setItem(KEY + path, JSON.stringify(p))
  const marks = () => [...document.querySelectorAll<HTMLElement>("mark.reader-highlight")].map((m) => m.textContent)
  const hl1 = (over: Partial<Highlight> = {}): Highlight => ({ id: "h1", text: "links to", prefix: "A note ", suffix: " another", note: "", at: 1, ...over })

  test("selecting words across elements highlights them, one mark per text node", () => {
    note()
    const p = prose().querySelector("p")!
    // From "note" in the first text node into the <em>.
    select(p.firstChild!, 2, p.querySelector("em")!.firstChild!, 5)
    expect(hl.highlightSelection()).toBe(true)
    expect(marks()).toEqual(["note ", "links"])
    const saved = page()
    expect(saved.title).toBe("The note")
    expect(saved.items[0]).toMatchObject({ text: "note links", prefix: "A ", note: "" })
    expect(document.getSelection()!.rangeCount).toBe(0)
    // A second highlight adds to the page, repainting both.
    const second = prose().querySelectorAll("p")[1]
    select(second.firstChild!, 0, second.firstChild!, 6)
    expect(hl.highlightSelection()).toBe(true)
    expect(page().items.map((h) => h.text)).toEqual(["note links", "Second"])
    expect(marks()).toEqual(["note ", "links", "Second"])
  })

  test("without a column the page title is the note's title", () => {
    document.title = "Doc title"
    document.body.innerHTML = `<article class="note"><div class="prose"><p>Some words here.</p></div></article>`
    const t = prose().querySelector("p")!.firstChild!
    select(t, 5, t, 10)
    expect(hl.highlightSelection()).toBe(true)
    expect(page().title).toBe("Doc title")
  })

  test("nothing selected, a selection outside the note, or no note highlights nothing", () => {
    note()
    expect(hl.highlightSelection()).toBe(false)
    expect(hl.selectionIn(prose())).toBeUndefined()
    const out = document.getElementById("outside")!.firstChild!
    select(out, 0, out, 4)
    expect(hl.highlightSelection()).toBe(false)
    document.body.innerHTML = `<p>no note</p>`
    expect(hl.highlightSelection()).toBe(false)
    expect(localStorage.length).toBe(0)
  })

  test("a selection of only an empty element is no selection", () => {
    note(`<p>Words</p><p><span></span></p>`)
    const span = prose().querySelector("span")!
    const words = prose().querySelector("p")!.firstChild!
    // Selected range starting at the end of the text and ending in an empty span spans no characters.
    select(words, 5, span, 0)
    expect(hl.selectionIn(prose())).toBeUndefined()
  })

  test("saved highlights are painted on setup; lost ones are not", () => {
    note()
    store(HERE, { title: "The note", items: [hl1(), hl1({ id: "gone", text: "vanished words" })] })
    hl.setupHighlights()
    expect(marks()).toEqual(["links to"])
    expect(document.querySelector<HTMLElement>("mark")!.dataset.highlight).toBe("h1")
    // Painting again does not double the marks.
    hl.setupHighlights()
    expect(marks()).toEqual(["links to"])
  })

  test("clicking a highlight edits the reader's note about it", () => {
    note()
    store(HERE, { title: "The note", items: [hl1({ note: "old" })] })
    hl.setupHighlights()
    document.body.dataset.highlightNote = "Thoughts"
    document.querySelector<HTMLElement>("mark")!.click()
    const dialog = document.querySelector<HTMLDialogElement>("dialog.highlight-edit")!
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector("blockquote")!.textContent).toBe("links to")
    expect(dialog.querySelector("label")!.firstChild!.textContent).toBe("Thoughts")
    const area = dialog.querySelector("textarea")!
    expect(area.value).toBe("old")
    area.value = "new words"
    dialog.querySelector<HTMLButtonElement>(".practice-good")!.click()
    expect(page().items[0].note).toBe("new words")
    expect(document.querySelector<HTMLElement>("mark")!.title).toBe("new words")
    expect(document.querySelector("dialog")).toBeNull()
    delete document.body.dataset.highlightNote
  })

  test("a highlight can be removed, and the last one removed clears the page", () => {
    note()
    store(HERE, { title: "The note", items: [hl1()] })
    hl.setupHighlights()
    document.querySelector<HTMLElement>("mark")!.click()
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    expect(dialog.querySelector("label")!.firstChild!.textContent).toBe("Your note")
    expect(dialog.querySelector(".practice-again")!.textContent).toBe("Remove")
    expect(dialog.querySelector(".practice-good")!.textContent).toBe("Save")
    dialog.querySelector<HTMLButtonElement>(".practice-again")!.click()
    expect(localStorage.getItem(KEY + HERE)).toBeNull()
    expect(marks()).toEqual([])
  })

  test("a click on a mark whose highlight is gone, or while selecting, opens nothing", () => {
    note()
    store(HERE, { title: "The note", items: [hl1()] })
    hl.setupHighlights()
    const mark = document.querySelector<HTMLElement>("mark")!
    // Selecting text inside a highlight is not a click on it.
    select(mark.firstChild!, 0, mark.firstChild!, 3)
    mark.click()
    expect(document.querySelector("dialog")).toBeNull()
    document.getSelection()!.removeAllRanges()
    localStorage.clear()
    mark.click()
    expect(document.querySelector("dialog")).toBeNull()
    // A mark off a note page opens nothing either.
    document.body.innerHTML = `<mark class="reader-highlight" data-highlight="h1">x</mark>`
    document.querySelector<HTMLElement>("mark")!.click()
    expect(document.querySelector("dialog")).toBeNull()
  })

  test("the list of highlights says so when there are none", () => {
    document.body.innerHTML = `<button data-open-highlights>Mine</button>`
    document.body.dataset.highlightsEmpty = "None yet"
    document.querySelector("button")!.click()
    const dialog = document.querySelector<HTMLDialogElement>("dialog.highlights-list")!
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector("h2")!.textContent).toBe("My highlights")
    expect(dialog.querySelector("p")!.textContent).toBe("None yet")
    expect(dialog.querySelector(".practice-actions")).toBeNull()
    expect(dialog.querySelector(".practice-close")!.getAttribute("aria-label")).toBe("Close")
    dialog.querySelector<HTMLButtonElement>(".practice-close")!.click()
    expect(document.querySelector("dialog")).toBeNull()
    delete document.body.dataset.highlightsEmpty
    hl.openHighlights()
    expect(document.querySelector("dialog p")!.textContent).toBe("")
  })

  test("the list shows every page by title, the reader's words, and what is lost here", () => {
    note()
    store(HERE, { title: "The note", items: [hl1({ note: "mine" }), hl1({ id: "gone", text: "vanished", at: 0 })] })
    store("/en-US/aardvark", { title: "Aardvark", items: [hl1({ id: "x", text: "far away" })] })
    localStorage.setItem(KEY + "/broken", "{nope")
    localStorage.setItem("unrelated", "1")
    Object.assign(document.body.dataset, { highlights: "Highlights", highlightLost: "lost", close: "Shut" })
    hl.openHighlights()
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    const sections = [...dialog.querySelectorAll("section")]
    expect(sections.map((s) => s.querySelector("a")!.textContent)).toEqual(["Aardvark", "The note"])
    expect(sections[1].querySelector("a")!.getAttribute("href")).toBe(HERE)
    expect([...sections[1].querySelectorAll("li")].map((li) => li.textContent)).toEqual(["links to — mine", "vanished (lost)"])
    // Lost is only known for the page on show.
    expect(sections[0].querySelector("li")!.textContent).toBe("far away")
    expect(dialog.querySelector(".practice-close")!.getAttribute("aria-label")).toBe("Shut")
    for (const k of ["highlights", "highlightLost", "close"]) delete document.body.dataset[k]
  })

  test("the highlights are copied as Markdown, and say so", async () => {
    note()
    document.body.insertAdjacentHTML("afterbegin", `<span class="brand-name">My Garden</span>`)
    store(HERE, { title: "The note", items: [hl1({ note: "  mine  " })] })
    const copied: string[] = []
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } })
    Object.assign(document.body.dataset, { highlights: "Highlights", copy: "Copy all", copied: "All copied" })
    hl.openHighlights()
    const copy = document.querySelector<HTMLButtonElement>("dialog .practice-again")!
    expect(copy.textContent).toBe("Copy all")
    copy.click()
    await settle()
    expect(copy.textContent).toBe("All copied")
    expect(copied[0]).toBe(
      "# Highlights · My Garden\n\n## [The note](https://garden.example/en-US/note)\n\n> links to\n>\n> [↗](https://garden.example/en-US/note#:~:text=links%20to)\n\nmine\n",
    )
    for (const k of ["highlights", "copy", "copied"]) delete document.body.dataset[k]
  })

  test("without a clipboard the copy fails quietly; the brand defaults to the host", async () => {
    store(HERE, { title: "The note", items: [hl1()] })
    document.body.innerHTML = ``
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => Promise.reject(new Error("denied")) } })
    hl.openHighlights()
    const copy = document.querySelector<HTMLButtonElement>("dialog .practice-again")!
    expect(copy.textContent).toBe("Copy")
    copy.click()
    await settle()
    expect(copy.textContent).toBe("Copy")
    const copied: string[] = []
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } })
    copy.click()
    await settle()
    expect(copy.textContent).toBe("Copied")
    expect(copied[0]).toStartWith("# undefined · garden.example\n")
  })

  test("the export downloads a Markdown file and lets its URL go", async () => {
    store(HERE, { title: "The note", items: [hl1()] })
    document.body.innerHTML = ``
    const realCreate = URL.createObjectURL
    const realRevoke = URL.revokeObjectURL
    const blobs: Blob[] = []
    const revoked: string[] = []
    URL.createObjectURL = (b: Blob) => (blobs.push(b), "blob:highlights")
    URL.revokeObjectURL = (u: string) => void revoked.push(u)
    const proto = dom.window.HTMLAnchorElement.prototype
    const realClick = proto.click
    const clicked: { href: string; download: string }[] = []
    proto.click = function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download })
    }
    try {
      hl.openHighlights()
      const save = document.querySelector<HTMLButtonElement>("dialog .practice-good")!
      expect(save.textContent).toBe("Export as Markdown")
      save.click()
      expect(clicked).toEqual([{ href: "blob:highlights", download: "highlights.md" }])
      expect(blobs[0].type).toBe("text/markdown")
      expect(await blobs[0].text()).toContain("## [The note](https://garden.example/en-US/note)")
      await settle(1050)
      expect(revoked).toEqual(["blob:highlights"])
    } finally {
      URL.createObjectURL = realCreate
      URL.revokeObjectURL = realRevoke
      proto.click = realClick
    }
  })

  test("blocked storage reads as no highlights and saves nothing", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!
    const throws = () => {
      throw new Error("blocked")
    }
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: throws,
        setItem: throws,
        removeItem: throws,
        get length() {
          return throws()
        },
      },
    })
    try {
      expect(hl.loadPage(HERE)).toBeUndefined()
      expect(hl.allPages()).toEqual([])
      note()
      const t = prose().querySelector("p")!.firstChild!
      select(t, 0, t, 6)
      expect(hl.highlightSelection()).toBe(true)
      // Painted for this visit, though nothing was kept.
      expect(marks()).toEqual(["A note"])
    } finally {
      Object.defineProperty(globalThis, "localStorage", real)
    }
  })

  test("pages are found by their path however it is spelled", () => {
    store("/Tiếng", { title: "T", items: [hl1()] })
    expect(hl.loadPage("/Ti%E1%BA%BFng/")!.title).toBe("T")
    expect(hl.loadPage("/100%")).toBeUndefined()
    expect(hl.loadPage("/")).toBeUndefined()
  })

  test("other clicks do nothing", () => {
    note()
    document.getElementById("outside")!.click()
    // A click on the document itself has no closest().
    document.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }) as unknown as Event)
    expect(document.querySelector("dialog")).toBeNull()
  })

  test("Markdown marks passages lost elsewhere when asked", () => {
    const md = hl.toMarkdown(
      [
        { url: "https://g/a", page: { title: "A", items: [hl1({ text: "two\nlines", at: 2 }), hl1({ id: "b", text: "first", at: 1 })] } },
        { url: "https://g/empty", page: { title: "E", items: [] } },
      ],
      "Mine",
      "lost",
      (_url, h) => h.id !== "h1",
    )
    expect(md).toBe(
      "# Mine\n\n## [A](https://g/a)\n\n> first\n>\n> [↗](https://g/a#:~:text=first)\n\n> two\n> lines\n>\n> [↗](https://g/a#:~:text=two%20lines) (lost)\n",
    )
    expect(hl.locate("abc", { text: "", prefix: "", suffix: "" })).toBe(-1)
  })
})
