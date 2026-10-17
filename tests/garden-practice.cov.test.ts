import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"
import type { Deck } from "../src/scripts/garden-practice"

type GardenPractice = typeof import("../src/scripts/garden-practice")
const DAY = 86_400_000

const card = (q: string) => `<details class="flashcard"><summary>${q}</summary><div class="flashcard-answer">A ${q}</div></details>`

describe("practising the whole garden", () => {
  let dom: Dom
  let gp: GardenPractice
  const realFetch = globalThis.fetch
  const fetched: string[] = []
  beforeAll(async () => {
    dom = installDom("https://garden.example/en-US/practice")
    globalThis.fetch = (async (url: string) => {
      fetched.push(String(url))
      if (url.includes("broken")) throw new Error("offline")
      if (url.includes("missing")) return new Response("", { status: 404 })
      return new Response(
        JSON.stringify({
          decks: [
            { u: "/en-US/Deck%20A", t: "Deck A", g: ["lang/en"], h: card("one") + card("two") },
            { u: "/en-US/deck-b/", t: "Deck B", g: ["math"], h: card("three") },
          ],
        }),
      )
    }) as unknown as typeof fetch
    gp = await import("../src/scripts/garden-practice")
  })
  afterEach(() => localStorage.clear())
  afterAll(() => {
    globalThis.fetch = realFetch
    dom.restore()
  })

  test("decks load once per language from their HTML; a missing or broken file is no decks", async () => {
    const decks = await gp.loadDecks("cov-gp")
    expect(await gp.loadDecks("cov-gp")).toBe(decks)
    expect(decks.map((d) => [d.u, d.t, d.cards.length])).toEqual([
      ["/en-US/Deck%20A", "Deck A", 2],
      ["/en-US/deck-b/", "Deck B", 1],
    ])
    expect(decks[0].cards[0].answer).toBe("A one")
    expect(await gp.loadDecks("cov-missing")).toEqual([])
    expect(await gp.loadDecks("cov-broken")).toEqual([])
    expect(fetched.filter((u) => u.includes("cov-gp"))).toEqual(["/static/cards.cov-gp.json"])
  })

  test("the garden queue puts the most overdue first, then new cards, and filters by deck or tag", async () => {
    const decks: Deck[] = [
      { u: "/a", t: "A", g: ["lang/en"], cards: [{ id: "a1", legacy: "", question: "", answer: "" }, { id: "a2", legacy: "", question: "", answer: "" }] },
      { u: "/b", t: "B", g: ["math"], cards: [{ id: "b1", legacy: "", question: "", answer: "" }, { id: "b2", legacy: "", question: "", answer: "" }] },
    ]
    const states: Record<string, Record<string, { box: number; due: number }>> = {
      "/a": { a1: { box: 1, due: 50 } },
      "/b": { b1: { box: 1, due: 10 }, b2: { box: 2, due: 500 } },
    }
    const ids = (q: { due: { card: { id: string } }[]; fresh: { card: { id: string } }[] }) => [q.due.map((i) => i.card.id), q.fresh.map((i) => i.card.id)]
    expect(ids(gp.gardenQueue(decks, (d) => states[d], 100))).toEqual([["b1", "a1"], ["a2"]])
    expect(ids(gp.gardenQueue(decks, (d) => states[d], 100, { deck: "/a/" }))).toEqual([["a1"], ["a2"]])
    expect(ids(gp.gardenQueue(decks, (d) => states[d], 100, { tag: "lang" }))).toEqual([["a1"], ["a2"]])
    expect(ids(gp.gardenQueue(decks, (d) => states[d], 100, { tag: "math" }))).toEqual([["b1"], []])
  })

  const page = (lang: string) => `<header><a data-due-badge data-label="{n} due" hidden><span></span></a></header>
    <section data-garden-practice data-lang="${lang}" data-counts="{due} due, {new} new" data-nothing="Nothing to practise"
      data-start="Practise {n}" data-show="Show" data-again="Again" data-good="Good" data-done="Done {n}" data-close="Close">
      <select data-practice-filter="deck"><option value="">All</option><option value="/en-US/deck-b">B</option></select>
      <select data-practice-filter="tag"><option value="">All</option><option value="none">none</option></select>
      <p data-practice-counts></p><div data-practice-start hidden></div>
    </section>`

  test("the practice page counts the cards, filters them, and runs a session that updates the badge", async () => {
    document.documentElement.dataset.lang = "cov-gp"
    document.body.innerHTML = page("cov-gp")
    await gp.setupGardenPractice()
    // Bound once.
    await gp.setupGardenPractice()
    const counts = document.querySelector("[data-practice-counts]")!
    const bar = document.querySelector<HTMLElement>("[data-practice-start]")!
    expect(counts.textContent).toBe("0 due, 3 new")
    expect(bar.hidden).toBe(false)
    expect(bar.querySelectorAll("button")).toHaveLength(1)
    expect(bar.querySelector("button")!.textContent).toBe("Practise 3")

    const [deckSel, tagSel] = document.querySelectorAll<HTMLSelectElement>("[data-practice-filter]")
    deckSel.value = "/en-US/deck-b"
    deckSel.dispatchEvent(new dom.window.Event("change") as unknown as Event)
    expect(counts.textContent).toBe("0 due, 1 new")
    tagSel.value = "none"
    tagSel.dispatchEvent(new dom.window.Event("change") as unknown as Event)
    expect(counts.textContent).toBe("Nothing to practise")
    expect(bar.hidden).toBe(true)
    expect(bar.children).toHaveLength(0)
    tagSel.value = ""
    tagSel.dispatchEvent(new dom.window.Event("change") as unknown as Event)

    // Practise deck B's one card, remember it, and close.
    bar.querySelector<HTMLButtonElement>("button")!.click()
    const dialog = document.querySelector<HTMLDialogElement>("dialog.practice")!
    expect(dialog.open).toBe(true)
    dialog.querySelector<HTMLButtonElement>(".practice-show")!.click()
    dialog.querySelector<HTMLButtonElement>(".practice-good")!.click()
    dialog.querySelector<HTMLButtonElement>(".practice-good")!.click()
    await settle(5)
    expect(document.querySelector("dialog.practice")).toBeNull()
    // A card remembered once goes to box 1, due again right away: it now counts as due, and so does the badge.
    expect(counts.textContent).toBe("1 due, 0 new")
    const badge = document.querySelector<HTMLAnchorElement>("[data-due-badge]")!
    expect(badge.querySelector("span")!.textContent).toBe("1")
    expect(badge.title).toBe("1 due")
    expect(badge.hidden).toBe(false)
  })

  test("a page without the practice section, or one already bound, is left alone", async () => {
    document.body.innerHTML = `<p>nothing</p>`
    await gp.setupGardenPractice()
    expect(document.body.innerHTML).toBe("<p>nothing</p>")
  })

  test("the badge shows only once the reader has practised, counting cards due", async () => {
    document.body.innerHTML = page("cov-gp")
    const badge = document.querySelector<HTMLAnchorElement>("[data-due-badge]")!
    await gp.setupDueBadge()
    expect(badge.hidden).toBe(true)
    expect(badge.title).toBe("")

    const deck = (await gp.loadDecks("cov-gp"))[0]
    localStorage.setItem("datme:cards:/en-US/Deck A", JSON.stringify({ [deck.cards[0].id]: { box: 1, due: Date.now() - DAY } }))
    await gp.setupDueBadge()
    expect(badge.querySelector("span")!.textContent).toBe("1")
    expect(badge.getAttribute("aria-label")).toBe("1 due")
    expect(badge.hidden).toBe(false)

    // Without a label it is just the count.
    delete badge.dataset.label
    await gp.setupDueBadge()
    expect(badge.title).toBe("1")
    document.body.innerHTML = ``
    await gp.setupDueBadge()
  })
})
