import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { getVault } from "../src/lib/vault"
import { renderMarkdown, renderNote } from "../src/lib/markdown"
import { warned, beforeWarning } from "../src/lib/spoilers"
import { firstParagraph, snippetOf } from "../src/lib/collection-views"
import { noteProperties } from "../src/lib/properties"
import { installDom, type Dom } from "./client-dom"

const md = (src: string) => renderMarkdown(src, "en-US", "spoilers-test")
const SPOILER = '<span class="spoiler" tabindex="0" role="button" aria-label="Spoiler, press to reveal">'

describe("inline spoilers", () => {
  test("||text|| is a focusable button that says what it is", async () => {
    expect(await md("The ||butler did it|| after all.")).toBe(`<p>The ${SPOILER}butler did it</span> after all.</p>`)
  })

  test("emphasis and links inside, several in a line, and in another language", async () => {
    const html = await md("||**bold** and [a link](x)|| then ||two||")
    expect(html).toContain(`${SPOILER}<strong>bold</strong> and <a href="x">a link</a></span>`)
    expect(html.match(/class="spoiler"/g)).toHaveLength(2)
    expect(await renderMarkdown("||bí mật||", "vi-VN", "spoilers-vi")).toContain('aria-label="Tiết lộ nội dung, nhấn để hiện"')
  })

  test("a logical OR, code, maths, empty cells and table cells are left alone", async () => {
    for (const src of [
      "if a || b then",
      "an empty `a||b||c` code span",
      "```js\nx = ||a||\n```",
      "maths $a||b||c$ here",
      "a lone || or an unclosed ||open",
      "| a | b |\n|---|---|\n| x || y |\n|  | ||z|| |",
      "| a | b |\n|---|---|\n| \\|\\|z\\|\\| | y |",
    ]) {
      expect(await md(src)).not.toContain("spoiler")
    }
  })

  test("a spoiler stays out of the text search and excerpts read", async () => {
    const note = {
      ...getVault().byKey["vi-VN"].get("03_Atomic/Zettelkasten")!,
      key: "spoiler-note",
      md: "Open ||secret|| and\n\n> [!spoiler]\n> hidden plot\n\nend",
      description: undefined,
    }
    const r = await renderNote(note)
    expect(r.text).not.toContain("secret")
    expect(r.text).not.toContain("hidden")
    expect(r.html).toContain("secret")
  })
})

describe("spoiler callouts", () => {
  test("stay folded, titled Spoiler unless named", async () => {
    expect(await md("> [!spoiler]\n> the end")).toMatch(/<details class="callout" data-callout="spoiler">\s*<summary class="callout-title">Spoiler<\/summary>/)
    expect(await md("> [!spoiler]+ Ending\n> the end")).toContain('<details class="callout" data-callout="spoiler" open>')
  })
})

describe("content warnings", () => {
  const base = getVault().byKey["vi-VN"].get("03_Atomic/Zettelkasten")!
  const tale = {
    ...base,
    key: "cw-note",
    url: "/cw-note",
    md: "# Tale\n\nThe butler did it.\n\n```js\nconst leak = 1\n```",
    warning: "violence",
    description: "violence",
  }

  test("the page keeps the text behind the warning; everything else gets the warning", async () => {
    const r = await renderNote(tale)
    expect(r.html).toContain('<details class="cw" data-cw="/cw-note">')
    expect(r.html).toContain(">Cảnh báo nội dung: violence</span>")
    expect(r.html).toContain("The butler did it.")
    expect(r.html).toContain("data-pagefind-ignore")
    expect(r.description).toBe("violence")
    expect(r.text).toBe("violence")
  })

  test("a collection card quotes nothing from behind the warning", async () => {
    const { html } = await renderNote(tale)
    expect(firstParagraph(html)).toBe("")
    expect(snippetOf(tale, html).code).toBeUndefined()
    expect(beforeWarning(warned("<p>x</p>", "w", "/u", "en-US"))).not.toContain("<p>x</p>")
  })

  test("an embedded section of a warned note comes behind the same notice", async () => {
    const note = getVault().byKey["vi-VN"].get("07_Project/Warned")!
    expect(note.warning).toBe("violence")
    const html = await renderMarkdown('<span class="transclude-ph" data-key="07_Project/Warned" data-fragment=""></span>', "vi-VN", "embedder")
    expect(html).toMatch(/<div class="transclude"[^>]*>[\s\S]*<details class="cw" data-cw="[^"]+">[\s\S]*<div class="cw-body"[^>]*>[\s\S]*hard scene/)
  })

  test("the property is read from cw or contentWarning, and is not listed among the properties", () => {
    expect(noteProperties({ ...base, source: { ...base.source, fm: { cw: "x", contentWarning: "y", author: "me" } } }).map(([k]) => k)).toEqual(["author"])
  })
})

describe("the browser scripts", () => {
  let dom: Dom
  let spoiler: typeof import("../src/scripts/spoiler")
  let ticks: typeof import("../src/scripts/ticks")
  beforeAll(async () => {
    dom = installDom("https://garden.example/cw-note")
    spoiler = await import("../src/scripts/spoiler")
    ticks = await import("../src/scripts/ticks")
  })
  afterAll(() => dom.restore())
  const key = (k: string) => new dom.window.KeyboardEvent("keydown", { key: k, cancelable: true })

  test("a spoiler reveals on a click, Enter or Space, and stops being a button", () => {
    dom.document.body.innerHTML = `<p>${SPOILER}a</span> ${SPOILER}b</span> ${SPOILER}c</span></p>`
    spoiler.setupSpoilers()
    spoiler.setupSpoilers()
    const [a, b, c] = [...dom.document.querySelectorAll<HTMLElement>(".spoiler")]
    const other = key("a")
    a.dispatchEvent(other)
    expect(a.classList.contains("revealed")).toBe(false)
    a.dispatchEvent(new dom.window.MouseEvent("click"))
    const enter = key("Enter")
    b.dispatchEvent(enter)
    c.dispatchEvent(key(" "))
    for (const el of [a, b, c]) {
      expect(el.classList.contains("revealed")).toBe(true)
      expect(el.getAttribute("role")).toBeNull()
      expect(el.getAttribute("aria-label")).toBeNull()
    }
    expect(enter.defaultPrevented).toBe(true)
  })

  test("a warning a reader opened stays open on the next visit, and closing forgets it", async () => {
    const page = () => {
      dom.document.body.innerHTML = `<details class="cw" data-cw="/cw-note"><summary>w</summary><p>text</p></details>`
      spoiler.setupSpoilers()
      return dom.document.querySelector<HTMLDetailsElement>("details.cw")!
    }
    let d = page()
    expect(d.open).toBe(false)
    d.open = true
    d.dispatchEvent(new dom.window.Event("toggle"))
    expect(ticks.loadTicks("cw", "/cw-note")).toEqual(["ok"])
    d = page()
    expect(d.open).toBe(true)
    d.open = false
    d.dispatchEvent(new dom.window.Event("toggle"))
    expect(ticks.loadTicks("cw", "/cw-note")).toBeNull()
  })

  test("blocked storage leaves the warning closed and throws nothing", () => {
    const real = dom.window.localStorage
    Object.defineProperty(dom.window, "localStorage", {
      get() {
        throw new Error("blocked")
      },
      configurable: true,
    })
    try {
      dom.document.body.innerHTML = `<details class="cw" data-cw="/blocked"><summary>w</summary></details>`
      expect(() => spoiler.setupSpoilers()).not.toThrow()
      expect(dom.document.querySelector<HTMLDetailsElement>("details.cw")!.open).toBe(false)
    } finally {
      Object.defineProperty(dom.window, "localStorage", { value: real, configurable: true })
    }
  })
})
