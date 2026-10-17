import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"

type Practice = typeof import("../src/scripts/practice")
let dom: Dom
let practice: Practice
beforeAll(async () => {
  dom = installDom("https://garden.example/notes/cards")
  practice = await import("../src/scripts/practice")
})
afterAll(() => dom.restore())

const DAY = 86_400_000
const blocked = {
  get length(): number {
    throw new Error("blocked")
  },
  key() {
    throw new Error("blocked")
  },
  getItem() {
    throw new Error("blocked")
  },
  setItem() {
    throw new Error("blocked")
  },
}
function withStorage<T>(storage: unknown, run: () => T): T {
  const real = globalThis.localStorage
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true })
  try {
    return run()
  } finally {
    Object.defineProperty(globalThis, "localStorage", { value: real, configurable: true, writable: true })
  }
}

describe("scheduling", () => {
  test("a remembered card climbs a box at a time up to the last; a forgotten one starts over", () => {
    expect(practice.grade(undefined, true, 0)).toEqual({ box: 1, due: 0 })
    expect(practice.grade({ box: 2, due: 0 }, true, 0)).toEqual({ box: 3, due: 3 * DAY })
    expect(practice.grade({ box: 5, due: 0 }, true, 0)).toEqual({ box: 5, due: 14 * DAY })
    expect(practice.grade({ box: 4, due: 0 }, false, 10)).toEqual({ box: 1, due: 10 })
  })

  test("due cards come first, most overdue first, then new ones; cards not yet due wait", () => {
    const states = { a: { box: 2, due: 50 }, b: { box: 1, due: 10 }, c: { box: 3, due: 500 } }
    expect(practice.queue(["a", "b", "c", "d"], states, 100)).toEqual(["b", "a", "d"])
  })

  test("deck paths are compared decoded and without a trailing slash", () => {
    expect(practice.deckPath("/Th%E1%BA%BB/")).toBe("/Thẻ")
    expect(practice.deckPath("/100%")).toBe("/100%")
    expect(practice.deckPath("///")).toBe("/")
  })
})

describe("cards of a deck", () => {
  test("flip cards and paragraphs with clozes become cards, ids stable whatever scripts added", () => {
    const prose = dom.document.createElement("div")
    prose.innerHTML = `<details class="flashcard"><summary>Q <span data-popover="1">1</span></summary><div class="flashcard-answer">A1</div></details>
      <details class="flashcard"><p>No summary, <span class="cloze">no answer</span></p></details>
      <p>A <span class="cloze revealed" data-bound="">cloze</span> here.<button class="copy-btn">copy</button></p><p>No cloze.</p>`
    const cards = practice.collect(prose)
    expect(cards.map((c) => [c.question, c.answer])).toEqual([
      [`Q <span data-popover="1">1</span>`, "A1"],
      ["", ""],
      [`A <span class="cloze">cloze</span> here.`, `A <span class="cloze revealed">cloze</span> here.`],
    ])
    const asBuilt = dom.document.createElement("summary")
    asBuilt.innerHTML = "Q <span>1</span>"
    expect(cards[0].id).toBe(practice.cardId(practice.pristine(asBuilt)))
    expect(cards[0].legacy).not.toBe(cards[0].id)
  })

  test("progress under a card's former id moves to its current one, once", () => {
    const cards = [
      { id: "new", legacy: "old", question: "", answer: "" },
      { id: "same", legacy: "same", question: "", answer: "" },
      { id: "kept", legacy: "gone", question: "", answer: "" },
    ]
    const states: Record<string, { box: number; due: number }> = { old: { box: 2, due: 1 }, same: { box: 1, due: 0 }, kept: { box: 3, due: 2 }, gone: { box: 1, due: 0 } }
    expect(practice.adoptLegacy(cards, states)).toBe(true)
    expect(states).toEqual({ new: { box: 2, due: 1 }, same: { box: 1, due: 0 }, kept: { box: 3, due: 2 }, gone: { box: 1, due: 0 } })
    expect(practice.adoptLegacy(cards, states)).toBe(false)
  })
})

describe("progress in the browser", () => {
  test("is saved per deck, found again under another spelling of its path, and moved there", () => {
    const ls = dom.window.localStorage
    ls.clear()
    expect(practice.hasPractised()).toBe(false)
    ls.setItem("other", "x")
    ls.setItem("datme:cards:/elsewhere", "{}")
    ls.setItem("datme:cards:/Th%E1%BA%BB/", JSON.stringify({ c: { box: 2, due: 5 } }))
    expect(practice.loadDeck("/Thẻ")).toEqual({ c: { box: 2, due: 5 } })
    expect(ls.getItem("datme:cards:/Thẻ")).toBe(JSON.stringify({ c: { box: 2, due: 5 } }))
    expect(ls.getItem("datme:cards:/Th%E1%BA%BB/")).toBeNull()
    expect(practice.loadDeck("/Th%E1%BA%BB")).toEqual({ c: { box: 2, due: 5 } })
    expect(practice.loadDeck("/never")).toEqual({})
    practice.saveDeck("/new/", { x: { box: 1, due: 0 } })
    expect(ls.getItem("datme:cards:/new")).toBe(JSON.stringify({ x: { box: 1, due: 0 } }))
    expect(practice.hasPractised()).toBe(true)
  })

  test("a spelling whose stored value vanished reads as empty", () => {
    const keys = ["datme:cards:/deck/"]
    const fake = {
      length: 1,
      key: (i: number) => keys[i] ?? null,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }
    expect(withStorage(fake, () => practice.loadDeck("/deck"))).toEqual({})
  })

  test("blocked or corrupt storage starts afresh, and saving quietly does nothing", () => {
    expect(withStorage(blocked, () => [practice.loadDeck("/a"), practice.hasPractised()])).toEqual([{}, false])
    expect(() => withStorage(blocked, () => practice.saveDeck("/a", {}))).not.toThrow()
    dom.window.localStorage.setItem("datme:cards:/bad", "{nope")
    expect(practice.loadDeck("/bad")).toEqual({})
  })
})

describe("a practice session", () => {
  const labels = { show: "Show", again: "Again", good: "Good", done: "Done: {n}", close: "Close" }
  const card = (id: string) => ({ id, legacy: id, question: `Q ${id}`, answer: `A ${id}` })
  const dialog = () => dom.document.querySelector<HTMLDialogElement>("dialog.practice")
  const press = (cls: string) => dialog()!.querySelector<HTMLButtonElement>(`.practice-actions .${cls}`)!.click()

  test("cards are shown, answered and saved; a forgotten one comes back; the end counts what was remembered", () => {
    dom.window.localStorage.clear()
    let ended = 0
    practice.runSession(
      [
        { deck: "/d1", card: card("a") },
        { deck: "/d2", card: card("b") },
      ],
      labels,
      () => ended++,
    )
    const d = dialog()!
    expect(d.open).toBe(true)
    expect(d.querySelector(".practice-progress")!.textContent).toBe("1 / 2")
    expect(d.querySelector(".practice-card")!.innerHTML).toBe("Q a")
    expect(dom.document.activeElement?.className).toBe("practice-show")
    press("practice-show")
    expect(d.querySelector(".practice-card")!.innerHTML).toBe("A a")
    expect(dom.document.activeElement?.className).toBe("practice-good")
    press("practice-again")
    expect(JSON.parse(dom.window.localStorage.getItem("datme:cards:/d1")!).a.box).toBe(1)
    expect(d.querySelector(".practice-progress")!.textContent).toBe("1 / 2")
    expect(d.querySelector(".practice-card")!.innerHTML).toBe("Q b")
    press("practice-show")
    press("practice-good")
    press("practice-show")
    press("practice-good")
    expect(JSON.parse(dom.window.localStorage.getItem("datme:cards:/d1")!).a.box).toBe(2)
    expect(d.querySelector(".practice-card")!.textContent).toBe("Done: 2")
    expect(d.querySelector(".practice-progress")!.textContent).toBe("")
    press("practice-good")
    expect(dialog()).toBeNull()
    expect(ended).toBe(1)
  })

  test("the close button ends a session at any time, with or without someone waiting for its end", () => {
    practice.runSession([{ deck: "/d", card: card("x") }], labels)
    expect(dialog()!.querySelector(".practice-close")!.getAttribute("aria-label")).toBe("Close")
    dialog()!.querySelector<HTMLButtonElement>(".practice-close")!.click()
    expect(dialog()).toBeNull()
  })

  test("the practice bar of a deck counts its cards and practises the due ones, or all when none is due", () => {
    dom.window.localStorage.clear()
    dom.document.body.innerHTML = `<article><div data-practice data-start="Practise {n} cards" data-show="Show" data-again="Again" data-good="Good" data-done="Done: {n}" data-close="Close" hidden></div>
      <div class="prose"><details class="flashcard"><summary>One</summary><div class="flashcard-answer">1</div></details>
      <details class="flashcard"><summary>Two</summary><div class="flashcard-answer">2</div></details></div></article>`
    practice.setupPractice()
    practice.setupPractice()
    const bar = dom.document.querySelector<HTMLElement>("[data-practice]")!
    expect(bar.hidden).toBe(false)
    const start = bar.querySelector<HTMLButtonElement>(".practice-start")!
    expect(bar.querySelectorAll(".practice-start")).toHaveLength(1)
    expect(start.textContent).toBe("Practise 2 cards")
    start.click()
    expect(dialog()!.querySelector(".practice-progress")!.textContent).toBe("1 / 2")
    press("practice-show")
    press("practice-good")
    press("practice-show")
    press("practice-good")
    press("practice-good")
    // Nothing due now: the whole deck is practised again.
    start.click()
    expect(dialog()!.querySelector(".practice-progress")!.textContent).toBe("1 / 2")
    dialog()!.querySelector<HTMLButtonElement>(".practice-close")!.click()
  })

  test("progress saved under a card's former id is carried over when a session starts", () => {
    dom.window.localStorage.clear()
    dom.document.body.innerHTML = `<article><div data-practice data-start="{n}" data-show="S" data-again="A" data-good="G" data-done="D" data-close="C"></div>
      <div class="prose"><p>A <span class="cloze">c</span>.</p></div></article>`
    // Earlier versions took the id of the cloze as scripts had bound it.
    dom.document.querySelector<HTMLElement>(".cloze")!.dataset.bound = ""
    const [c] = practice.collect(dom.document.querySelector(".prose")!)
    expect(c.legacy).not.toBe(c.id)
    dom.window.localStorage.setItem("datme:cards:/notes/cards", JSON.stringify({ [c.legacy]: { box: 3, due: 0 } }))
    practice.setupPractice()
    dom.document.querySelector<HTMLButtonElement>(".practice-start")!.click()
    expect(JSON.parse(dom.window.localStorage.getItem("datme:cards:/notes/cards")!)).toEqual({ [c.id]: { box: 3, due: 0 } })
    dialog()!.querySelector<HTMLButtonElement>(".practice-close")!.click()
  })

  test("a page without a bar, a bar outside a note, or a deck with no cards gets no practice", () => {
    dom.document.body.innerHTML = ""
    practice.setupPractice()
    dom.document.body.innerHTML = `<div data-practice hidden></div>`
    practice.setupPractice()
    expect(dom.document.querySelector<HTMLElement>("[data-practice]")!.hidden).toBe(true)
    dom.document.body.innerHTML = `<article><div data-practice data-start="{n}" hidden></div><div class="prose"><p>Plain</p></div></article>`
    practice.setupPractice()
    expect(dom.document.querySelector<HTMLElement>("[data-practice]")!.hidden).toBe(true)
  })
})

describe("clozes", () => {
  test("a click reveals a cloze and another hides it again; each is bound once", () => {
    dom.document.body.innerHTML = `<div class="prose"><p>The <span class="cloze" tabindex="0">answer</span> and <span class="cloze">another</span>.</p></div><span class="cloze" id="out">outside</span>`
    practice.setupClozes()
    practice.setupClozes()
    const [first, second] = dom.document.querySelectorAll<HTMLElement>(".prose .cloze")
    first.click()
    expect(first.classList.contains("revealed")).toBe(true)
    expect(second.classList.contains("revealed")).toBe(false)
    first.click()
    expect(first.classList.contains("revealed")).toBe(false)
    const out = dom.document.getElementById("out")!
    out.click()
    expect(out.classList.contains("revealed")).toBe(false)
    expect(out.hasAttribute("data-bound")).toBe(false)
  })
})
