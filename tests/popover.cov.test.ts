import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, until, type Dom } from "./client-dom"

type Popover = typeof import("../src/scripts/popover")
let dom: Dom
let pop: Popover
const realFetch = globalThis.fetch
const pages = new Map<string, () => Promise<Response>>()
const asked: { url: string; init?: RequestInit }[] = []
let offsetTop: PropertyDescriptor | undefined
beforeAll(async () => {
  dom = installDom("https://garden.example/notes/here")
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    asked.push({ url: String(url), init })
    const page = pages.get(String(url))
    return page ? page() : new Response("missing", { status: 404 })
  }) as unknown as typeof fetch
  // Layout stands in for the browser's: a target sits 120px down the note, the note itself 20px.
  const proto = dom.window.HTMLElement.prototype
  offsetTop = Object.getOwnPropertyDescriptor(proto, "offsetTop")
  Object.defineProperty(proto, "offsetTop", {
    get(this: HTMLElement) {
      return this.dataset.id === "deep" ? 120 : 20
    },
    configurable: true,
  })
  pop = await import("../src/scripts/popover")
})
afterAll(() => {
  globalThis.fetch = realFetch
  if (offsetTop) Object.defineProperty(dom.window.HTMLElement.prototype, "offsetTop", offsetTop)
  dom.restore()
})

const html = (body: string) => () => Promise.resolve(new Response(`<!doctype html><html><body>${body}</body></html>`))
const note = (title: string, prose: string) => html(`<article class="note"><h1 class="note-title">${title}</h1><div class="prose">${prose}</div></article>`)
/** A link the pointer is on: happy-dom never matches :hover by itself. */
const hovered = (a: HTMLAnchorElement, on = true) => {
  const matches = a.matches.bind(a)
  a.matches = ((s: string) => (s === ":hover" ? on : matches(s))) as typeof a.matches
  return a
}
const enter = (a: Element) => a.dispatchEvent(new dom.window.Event("mouseenter"))
const leave = (a: Element) => a.dispatchEvent(new dom.window.Event("mouseleave"))
const popover = () => dom.document.querySelector<HTMLElement>(".popover")
const page = (body: string) => {
  dom.document.body.innerHTML = `<main class="main">${body}</main>`
  pop.setupPopovers()
  return [...dom.document.querySelectorAll<HTMLAnchorElement>("a")].map((a) => hovered(a))
}

describe("previews of notes of this garden", () => {
  test("hovering a link shows the note's title and text, without ids, under the link", async () => {
    pages.set("/notes/one", note("One", `<h2 id="intro">Intro</h2><p>First <b>words</b>.</p><div class="marp-deck"></div>`))
    const [a] = page(`<div class="prose"><a class="internal" href="/notes/one">One</a></div>`)
    enter(a)
    await until(() => popover())
    const p = popover()!
    expect(p.querySelector("h3")!.textContent).toBe("One")
    expect(p.querySelector(".prose b")!.textContent).toBe("words")
    expect(p.querySelector("[id]")).toBeNull()
    expect(p.querySelector("h2")!.getAttribute("data-id")).toBe("intro")
    expect(p.style.left).toBe("8px")
    expect(p.style.top).toBe("8px")
    leave(a)
    expect(popover()).toBeNull()
  })

  test("a link to a heading scrolls the preview to it; a page is fetched once", async () => {
    pages.set("/notes/two", note("Two", `<p>Top</p><h2 id="deep">Deep</h2>`))
    const [a, b] = page(`<a class="note-row" href="/notes/two#deep">Two</a><a class="internal" href="/notes/two#nowhere">Two again</a>`)
    enter(a)
    await until(() => popover())
    expect(popover()!.querySelector<HTMLElement>(".prose")!.style.transform).toBe("translateY(-100px)")
    enter(b)
    await settle(320)
    expect(popover()!.querySelector<HTMLElement>(".prose")!.style.transform).toBe("")
    expect(asked.filter((r) => r.url === "/notes/two")).toHaveLength(1)
  })

  test("a note without prose shows its title alone; one without a title an empty heading", async () => {
    pages.set("/notes/bare", html(`<article class="note"><p>no prose</p></article>`))
    const [a] = page(`<a class="internal" href="/notes/bare#x">Bare</a>`)
    enter(a)
    await until(() => popover())
    expect(popover()!.querySelector("h3")!.textContent).toBe("")
    expect(popover()!.querySelector(".prose")).toBeNull()
  })

  test("near the bottom of the window the preview goes above its link", async () => {
    pages.set("/notes/low", note("Low", "<p>x</p>"))
    const [a] = page(`<a class="internal" href="/notes/low">Low</a>`)
    a.getBoundingClientRect = () => ({ left: 5000, top: 2000, bottom: 2020 }) as DOMRect
    enter(a)
    await until(() => popover())
    expect(popover()!.style.top).toBe("1992px")
    expect(popover()!.style.left).toBe(`${dom.window.innerWidth - 8}px`)
  })

  test("nothing shows for a failed page, a page that is not a note, a network error, or a link left before it loads", async () => {
    pages.set("/notes/plain", html(`<p>not a note</p>`))
    pages.set("/notes/broken", () => Promise.reject(new Error("offline")))
    pages.set("/notes/late", note("Late", "<p>x</p>"))
    const links = page(`<a class="internal" href="/notes/gone">Gone</a><a class="internal" href="/notes/plain">Plain</a>
      <a class="internal" href="/notes/broken">Broken</a><a class="internal" href="/notes/late">Late</a>`)
    hovered(links[3], false)
    for (const a of links) {
      enter(a)
      await settle(320)
      expect(popover()).toBeNull()
    }
  })

  test("links to the page itself, anchors, links in previews and links bound before are left alone", async () => {
    const links = page(`<a class="internal" href="/notes/here/">Here</a><a class="internal anchor" href="/notes/x">#</a>
      <div class="popover"><a class="internal" href="/notes/y">In a preview</a></div>`)
    expect(links.map((a) => a.dataset.popover ?? "")).toEqual(["1", "", ""])
    pop.setupPopovers()
    for (const a of links) enter(a)
    await settle(320)
    expect(asked.some((r) => ["/notes/here/", "/notes/x", "/notes/y"].includes(r.url))).toBe(false)
  })

  test("a touch screen gets no previews", () => {
    const real = globalThis.matchMedia
    globalThis.matchMedia = ((q: string) => ({ matches: q === "(pointer: coarse)" })) as typeof matchMedia
    try {
      dom.document.body.innerHTML = `<main class="main"><a class="internal" href="/notes/one">One</a></main>`
      pop.setupPopovers()
      expect(dom.document.querySelector("a")!.dataset.popover).toBeUndefined()
    } finally {
      globalThis.matchMedia = real
    }
  })
})

describe("previews of notes of neighbour gardens", () => {
  test("a garden link shows the title and first paragraphs of the note's markdown copy, and the garden", async () => {
    pages.set("https://friend.example/notes/idea.md", () => Promise.resolve(new Response("# An idea\n\nIt is **good**.\n\nSee [[Other|another]].")))
    const [a] = page(`<div class="prose"><a class="garden-link" href="https://friend.example/notes/idea/">idea</a></div>`)
    enter(a)
    await until(() => popover())
    const p = popover()!
    expect(p.querySelector("h3")!.textContent).toBe("An idea")
    expect(p.querySelector(".popover-garden")!.textContent).toBe("🌿 friend.example")
    expect([...p.querySelectorAll(".prose p")].map((x) => x.textContent)).toEqual(["It is good.", "See another."])
    expect(asked.find((r) => r.url === "https://friend.example/notes/idea.md")!.init).toEqual({ mode: "cors" })
    leave(a)
    expect(popover()).toBeNull()
  })

  test("a copy without a title is named by its link; a garden that refuses or fails shows nothing", async () => {
    pages.set("https://friend.example/untitled.md", () => Promise.resolve(new Response("Just text.")))
    pages.set("https://friend.example/down.md", () => Promise.reject(new Error("CORS")))
    const [a, refused, down, empty] = page(`<div class="prose"><a class="garden-link" href="https://friend.example/untitled">Untitled link</a>
      <a class="garden-link" href="https://friend.example/refused">Refused</a><a class="garden-link" href="https://friend.example/down">Down</a>
      <a class="garden-link" href="https://friend.example/untitled"></a></div>`)
    enter(a)
    await until(() => popover())
    expect(popover()!.querySelector("h3")!.textContent).toBe("Untitled link")
    for (const l of [refused, down]) {
      leave(l)
      enter(l)
      await settle(320)
      expect(popover()).toBeNull()
    }
    // Nothing to name it by at all: an empty heading.
    enter(empty)
    await until(() => popover())
    expect(popover()!.querySelector("h3")!.textContent).toBe("")
    leave(empty)
    // Bound once, and never inside a preview.
    pop.setupPopovers()
    dom.document.body.insertAdjacentHTML("beforeend", `<div class="popover"><div class="prose"><a class="garden-link" href="https://friend.example/x">x</a></div></div>`)
    pop.setupPopovers()
    expect(dom.document.querySelector<HTMLElement>(".popover .garden-link")!.dataset.popover).toBeUndefined()
  })

  test("remotePreview leaves out code and markup, and keeps three paragraphs", () => {
    expect(pop.remotePreview("")).toEqual({ title: "", text: [] })
    const md = "Intro ![img](x.png) and ![[Embed]] and `code`.\n\n```js\nlet x\n```\n\n> quote\n\n- item\n\n1. one"
    expect(pop.remotePreview(md)).toEqual({ title: "", text: ["Intro img and Embed and code.", "quote", "item"] })
  })
})

describe("footnotes and citations", () => {
  const prose = `<div class="prose"><p>Text<sup><a href="#fn-1" data-footnote-ref>1</a></sup><span class="sidenote">Side</span>
    and <a class="citation" href="#ref-a">A 2020</a> and <a class="citation" href="#ref-none">none</a>.</p>
    <ol><li id="fn-1">The <em id="em">note</em>. <a href="#r" class="data-footnote-backref">↩</a></li></ol><p id="ref-a">A. (2020). Book.</p></div>`

  test("hovering shows the footnote or reference on the page, in a small popover", async () => {
    const [fn, cite] = page(prose)
    enter(fn)
    await until(() => popover())
    expect(popover()!.className).toBe("popover popover-small")
    expect(popover()!.querySelector(".popover-local")!.innerHTML).toBe("The <em>note</em>. ")
    leave(fn)
    enter(cite)
    await until(() => popover())
    expect(popover()!.textContent).toBe("A. (2020). Book.")
    leave(cite)
  })

  test("a footnote already in the margin, a reference that is missing, or a link left in time show nothing", async () => {
    const [fn, , missing] = page(prose)
    const side = dom.document.querySelector<HTMLElement>(".sidenote")!
    Object.defineProperty(side, "offsetParent", { value: dom.document.body, configurable: true })
    enter(fn)
    enter(missing)
    await settle(230)
    expect(popover()).toBeNull()
    Object.defineProperty(side, "offsetParent", { value: null, configurable: true })
    hovered(fn, false)
    enter(fn)
    await settle(230)
    expect(popover()).toBeNull()
  })

  test("links bound before, or inside a preview, are skipped", () => {
    page(`<div class="popover"><div class="prose"><a class="citation" href="#ref-a">A</a></div></div>`)
    pop.setupPopovers()
    expect(dom.document.querySelector<HTMLElement>(".citation")!.dataset.popover).toBeUndefined()
  })

  test("hidePopover removes whatever is shown", async () => {
    const [, cite] = page(prose)
    enter(cite)
    await until(() => popover())
    pop.hidePopover()
    expect(popover()).toBeNull()
    pop.hidePopover()
  })
})
