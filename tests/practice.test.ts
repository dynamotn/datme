import { beforeAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { cardId, grade, queue, INTERVALS } from "../src/scripts/practice"
import { flashcards } from "../src/lib/flashcards"

const DAY = 86_400_000

describe("Leitner boxes", () => {
  test("a remembered card moves up a box and waits longer; a forgotten one starts over", () => {
    const now = 1_000_000
    const first = grade(undefined, true, now)
    expect(first).toEqual({ box: 1, due: now })
    const second = grade(first, true, now)
    expect(second).toEqual({ box: 2, due: now + INTERVALS[1] * DAY })
    expect(grade({ box: 5, due: 0 }, true, now).box).toBe(5)
    expect(grade({ box: 4, due: 0 }, false, now)).toEqual({ box: 1, due: now })
  })

  test("due cards come first, most overdue first, then new ones; future ones wait", () => {
    const states = { a: { box: 2, due: 50 }, b: { box: 1, due: 10 }, c: { box: 3, due: 500 } }
    expect(queue(["a", "b", "c", "d"], states, 100)).toEqual(["b", "a", "d"])
  })

  test("card ids are stable and differ between questions", () => {
    expect(cardId("What is a Zettel?")).toBe(cardId("What is a Zettel?"))
    expect(cardId("a")).not.toBe(cardId("b"))
  })
})

describe("clozes", () => {
  test("highlights outside cards become clozes; inside cards and code they stay", () => {
    const out = flashcards("The ==mitochondria== is the powerhouse.\n\nQ::==A==\n\n`==code==`", "Show")
    expect(out).toContain('The <span class="cloze" tabindex="0">mitochondria</span> is the powerhouse.')
    expect(out).toContain("==A==")
    expect(out).toContain("`==code==`")
  })
})

describe("practice session", () => {
  const happy = new Window({ url: "https://garden.example/deck" })
  const window = happy as unknown as globalThis.Window & typeof globalThis
  const document = window.document
  beforeAll(() => {
    Object.assign(globalThis, { document, window, location: window.location, localStorage: window.localStorage })
  })
  const click = (el: Element | null) => el!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))

  test("cards and cloze paragraphs are practised one by one, a forgotten card comes back", async () => {
    document.body.innerHTML = `<article>
      <div class="practice-bar" data-practice data-start="Practice {n}" data-show="Show" data-again="Again" data-good="Got it" data-done="Done {n}" data-close="Close" hidden></div>
      <div class="prose">
        <details class="flashcard"><summary>Q1</summary><div class="flashcard-answer">A1</div></details>
        <p>The <span class="cloze">cell</span> wall.</p>
      </div></article>`
    const { setupPractice } = await import("../src/scripts/practice")
    setupPractice()
    const start = document.querySelector(".practice-start")!
    expect(start.textContent).toBe("Practice 2")
    click(start)
    const dialog = document.querySelector("dialog.practice")!
    const face = () => dialog.querySelector(".practice-card")!.innerHTML
    expect(face()).toBe("Q1")
    click(dialog.querySelector(".practice-show"))
    expect(face()).toBe("A1")
    click(dialog.querySelector(".practice-again"))
    expect(face()).toContain('<span class="cloze">cell</span>')
    click(dialog.querySelector(".practice-show"))
    expect(face()).toContain('<span class="cloze revealed">cell</span>')
    click(dialog.querySelector(".practice-good"))
    // The forgotten card is asked again before the session ends.
    expect(face()).toBe("Q1")
    click(dialog.querySelector(".practice-show"))
    click(dialog.querySelector(".practice-good"))
    expect(face()).toBe("Done 2")
    const saved = JSON.parse(window.localStorage.getItem("datme:cards:/deck")!)
    expect(Object.values(saved).map((s) => (s as { box: number }).box).sort()).toEqual([1, 2])
  })
})

describe("card ids", () => {
  test("a cloze card keeps its id whether its clozes are bound or revealed, on its page or on /practice", async () => {
    const happy = new Window()
    const doc = happy.document as unknown as Document
    const { collect } = await import("../src/scripts/practice")
    const fresh = doc.createElement("div")
    fresh.innerHTML = '<p>The <span class="cloze" tabindex="0">cell</span> wall.</p>'
    const onPage = doc.createElement("div")
    onPage.innerHTML = '<p>The <span class="cloze revealed" tabindex="0" data-bound="">cell</span> wall.</p>'
    expect(collect(fresh)[0].id).toBe(collect(onPage)[0].id)
  })

  test("links with popovers and code with a copy button do not change a card's id", async () => {
    const happy = new Window()
    const doc = happy.document as unknown as Document
    const { collect } = await import("../src/scripts/practice")
    const built = doc.createElement("div")
    built.innerHTML = '<details class="flashcard"><summary><a class="internal" href="/x">X</a> <pre><code>x</code></pre></summary><div class="flashcard-answer">A</div></details>'
    const onPage = doc.createElement("div")
    onPage.innerHTML = '<details class="flashcard"><summary><a class="internal" href="/x" data-popover="1">X</a> <pre><code>x</code><button class="copy-btn">Copy</button></pre></summary><div class="flashcard-answer">A</div></details>'
    expect(collect(built)[0].id).toBe(collect(onPage)[0].id)
  })

  test("progress saved under a card's former id moves to its current one", async () => {
    const { adoptLegacy } = await import("../src/scripts/practice")
    const card = { id: "new", legacy: "old", question: "", answer: "" }
    const states: Record<string, { box: number; due: number }> = { old: { box: 3, due: 9 } }
    expect(adoptLegacy([card], states)).toBe(true)
    expect(states).toEqual({ new: { box: 3, due: 9 } })
    expect(adoptLegacy([card], states)).toBe(false)
  })
})

describe("the garden's practice page", () => {
  const card = (id: string) => ({ id, legacy: id, question: id, answer: id })
  const decks = [
    { u: "/Spanish/", t: "Spanish", g: ["lang/es"], cards: [card("hola"), card("adios")] },
    { u: "/Biology", t: "Biology", g: ["science"], cards: [card("cell")] },
  ]
  const states: Record<string, Record<string, { box: number; due: number }>> = {
    "/Spanish": { hola: { box: 2, due: 50 } },
    "/Biology": { cell: { box: 1, due: 10 } },
  }
  const stateOf = (u: string) => states[u.replace(/\/$/, "")] ?? {}

  test("due cards of every deck come first, most overdue first, then new ones", async () => {
    const { gardenQueue } = await import("../src/scripts/garden-practice")
    const { due, fresh } = gardenQueue(decks, stateOf, 100)
    expect(due.map((i) => i.card.id)).toEqual(["cell", "hola"])
    expect(fresh.map((i) => `${i.deck} ${i.card.id}`)).toEqual(["/Spanish/ adios"])
  })

  test("filters keep one deck, however its URL is spelled, or the decks of a tag and its children", async () => {
    const { gardenQueue } = await import("../src/scripts/garden-practice")
    expect(gardenQueue(decks, stateOf, 100, { deck: "/Spanish" }).due.map((i) => i.card.id)).toEqual(["hola"])
    expect(gardenQueue(decks, stateOf, 100, { tag: "lang" }).fresh.map((i) => i.card.id)).toEqual(["adios"])
    expect(gardenQueue(decks, stateOf, 100, { tag: "science" }).due.map((i) => i.card.id)).toEqual(["cell"])
  })
})

describe("deck progress", () => {
  const happy = new Window({ url: "https://garden.example/" })
  const window = happy as unknown as globalThis.Window & typeof globalThis
  beforeAll(() => {
    Object.assign(globalThis, { localStorage: window.localStorage })
  })

  test("a deck is the same with or without a trailing slash or percent-encoding", async () => {
    const { deckPath } = await import("../src/scripts/practice")
    expect(deckPath("/Ti%E1%BA%BFng/Deck/")).toBe("/Tiếng/Deck")
    expect(deckPath("/")).toBe("/")
  })

  test("progress saved under another spelling of a deck's path moves to the canonical one", async () => {
    const { loadDeck, hasPractised } = await import("../src/scripts/practice")
    window.localStorage.clear()
    expect(hasPractised()).toBe(false)
    window.localStorage.setItem("datme:cards:/Ti%E1%BA%BFng/Deck/", JSON.stringify({ a: { box: 2, due: 5 } }))
    expect(loadDeck("/Tiếng/Deck")).toEqual({ a: { box: 2, due: 5 } })
    expect(window.localStorage.getItem("datme:cards:/Tiếng/Deck")).not.toBeNull()
    expect(window.localStorage.getItem("datme:cards:/Ti%E1%BA%BFng/Deck/")).toBeNull()
    expect(hasPractised()).toBe(true)
  })
})
