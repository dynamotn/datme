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
