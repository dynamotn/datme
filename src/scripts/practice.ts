/**
 * Practice the flashcards of a deck note one at a time, Leitner style: a card
 * remembered moves up a box and comes back later, one forgotten starts over.
 * Progress stays in the reader's browser, per deck.
 */

/** Days until a card in each box is due again; box 1 is due right away. */
export const INTERVALS = [0, 1, 3, 7, 14]
const DAY = 86_400_000

export interface CardState {
  box: number
  /** When the card is due again, in ms since the epoch. */
  due: number
}

/** The new state of a card after an answer. */
export function grade(state: CardState | undefined, remembered: boolean, now: number): CardState {
  const box = remembered ? Math.min((state?.box ?? 0) + 1, INTERVALS.length) : 1
  return { box, due: now + INTERVALS[box - 1] * DAY }
}

/** Cards in the order to practise them: due ones first, the most overdue first, then new ones. */
export function queue(ids: string[], states: Record<string, CardState>, now: number): string[] {
  const due = ids.filter((id) => states[id] && states[id].due <= now).sort((a, b) => states[a].due - states[b].due)
  const fresh = ids.filter((id) => !states[id])
  return [...due, ...fresh]
}

/** A short stable id for a card, from its question. */
export function cardId(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

export interface Card {
  id: string
  /** The id earlier versions gave the card, from its HTML as scripts had changed it; kept to carry progress over. */
  legacy: string
  question: string
  answer: string
}

/** Attributes scripts add to a note's HTML once it is on the page. */
const RUNTIME_ATTRS = ["data-bound", "data-popover", "data-drawn"]

/**
 * The HTML of a card as the build wrote it, without what scripts added on the
 * page (bound clozes, popovers, copy buttons, revealed answers), so the card
 * has the same id on its deck's page and on /practice, on any device.
 */
export function pristine(el: Element): string {
  const copy = el.cloneNode(true) as Element
  copy.querySelectorAll(".copy-btn").forEach((b) => b.remove())
  for (const node of [copy, ...copy.querySelectorAll("*")]) {
    for (const attr of RUNTIME_ATTRS) node.removeAttribute(attr)
    node.classList.remove("revealed")
  }
  return copy.innerHTML
}

/** Flip cards give a question and an answer; a paragraph with clozes is both, hidden then shown. */
export function collect(prose: Element): Card[] {
  const cards: Card[] = []
  for (const d of prose.querySelectorAll("details.flashcard")) {
    const summary = d.querySelector(":scope > summary")
    const q = summary?.innerHTML ?? ""
    cards.push({ id: cardId(summary ? pristine(summary) : ""), legacy: cardId(q), question: q, answer: d.querySelector(".flashcard-answer")?.innerHTML ?? "" })
  }
  for (const el of prose.querySelectorAll("p, li, td")) {
    if (!el.querySelector(".cloze") || el.closest("details.flashcard")) continue
    const html = pristine(el)
    cards.push({ id: cardId(html), legacy: cardId(el.innerHTML), question: html, answer: html.replace(/class="cloze"/g, 'class="cloze revealed"') })
  }
  return cards
}

/** Move progress saved under the cards' former ids to their current ones. */
export function adoptLegacy(cards: Card[], states: Record<string, CardState>): boolean {
  let moved = false
  for (const c of cards) {
    if (states[c.id] || !states[c.legacy] || c.legacy === c.id) continue
    states[c.id] = states[c.legacy]
    delete states[c.legacy]
    moved = true
  }
  return moved
}

const KEY = "datme:cards:"

/** A deck's path as stored: decoded, without a trailing slash, however the host serves it. */
export function deckPath(path: string): string {
  try {
    path = decodeURI(path)
  } catch {
    // keep the raw path
  }
  return path.replace(/\/+$/, "") || "/"
}

/** The progress of a deck. Progress stored under another spelling of its path moves to this one. */
export function loadDeck(path: string): Record<string, CardState> {
  const key = KEY + deckPath(path)
  try {
    const found = localStorage.getItem(key)
    if (found) return JSON.parse(found)
    for (let i = 0; i < localStorage.length; i++) {
      const other = localStorage.key(i)
      if (!other?.startsWith(KEY) || other === key || deckPath(other.slice(KEY.length)) !== deckPath(path)) continue
      const states = JSON.parse(localStorage.getItem(other) ?? "{}")
      localStorage.setItem(key, JSON.stringify(states))
      localStorage.removeItem(other)
      return states
    }
  } catch {
    // unreadable or blocked storage: start afresh
  }
  return {}
}

export function saveDeck(path: string, states: Record<string, CardState>): void {
  try {
    localStorage.setItem(KEY + deckPath(path), JSON.stringify(states))
  } catch {
    // private mode: progress lasts for this visit only
  }
}

/** Whether the reader has practised any deck in this browser. */
export function hasPractised(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(KEY)) return true
  } catch {
    // no storage, no progress
  }
  return false
}

function button(label: string, cls: string): HTMLButtonElement {
  const b = document.createElement("button")
  b.type = "button"
  b.className = cls
  b.textContent = label
  return b
}

/** Labels of a practice session, from the data attributes of the element that starts it. */
export interface SessionLabels {
  show?: string
  again?: string
  good?: string
  done?: string
  close?: string
}

/** A card to practise and the deck it belongs to. */
export interface Item {
  deck: string
  card: Card
}

/**
 * Practise cards in a dialog, in the given order, saving each answer to its
 * deck. A forgotten card comes back at the end of the session.
 */
export function runSession(items: Item[], s: SessionLabels, onEnd?: () => void): void {
  const states = new Map<string, Record<string, CardState>>()
  const stateOf = (deck: string) => states.get(deck) ?? states.set(deck, loadDeck(deck)).get(deck)!
  const queueLeft = [...items]
  const dialog = document.createElement("dialog")
  dialog.className = "practice"
  const progress = document.createElement("p")
  progress.className = "practice-progress"
  const face = document.createElement("div")
  face.className = "practice-card prose"
  const actions = document.createElement("div")
  actions.className = "practice-actions"
  const close = button("×", "practice-close")
  close.setAttribute("aria-label", s.close!)
  close.addEventListener("click", () => dialog.close())
  dialog.append(close, progress, face, actions)
  dialog.addEventListener("close", () => (dialog.remove(), onEnd?.()))
  document.body.append(dialog)

  let done = 0
  const next = () => {
    actions.replaceChildren()
    const item = queueLeft.shift()
    if (!item) {
      progress.textContent = ""
      face.textContent = s.done!.replace("{n}", String(done))
      actions.append(button(s.close!, "practice-good"))
      actions.firstElementChild!.addEventListener("click", () => dialog.close())
      return
    }
    const { deck, card } = item
    progress.textContent = `${done + 1} / ${done + 1 + queueLeft.length}`
    face.innerHTML = card.question
    const show = button(s.show!, "practice-show")
    show.addEventListener("click", () => {
      face.innerHTML = card.answer
      const again = button(s.again!, "practice-again")
      const good = button(s.good!, "practice-good")
      const answer = (remembered: boolean) => {
        const deckStates = stateOf(deck)
        deckStates[card.id] = grade(deckStates[card.id], remembered, Date.now())
        saveDeck(deck, deckStates)
        if (!remembered) queueLeft.push(item)
        else done++
        next()
      }
      again.addEventListener("click", () => answer(false))
      good.addEventListener("click", () => answer(true))
      actions.replaceChildren(again, good)
      good.focus()
    })
    actions.append(show)
    show.focus()
  }
  dialog.showModal()
  next()
}

/** The practice bar of a deck: counts its cards and runs a session in a dialog. */
export function setupPractice(): void {
  const bar = document.querySelector<HTMLElement>("[data-practice]")
  const prose = bar?.closest("article")?.querySelector(".prose")
  if (!bar || !prose || bar.dataset.bound) return
  bar.dataset.bound = "1"
  const s = bar.dataset
  const cards = collect(prose)
  if (!cards.length) return
  const start = button(s.start!.replace("{n}", String(cards.length)), "practice-start")
  bar.append(start)
  bar.hidden = false

  start.addEventListener("click", () => {
    const deck = location.pathname
    const byId = new Map(cards.map((c) => [c.id, c]))
    const states = loadDeck(deck)
    if (adoptLegacy(cards, states)) saveDeck(deck, states)
    // Everything is due on the first session, so a deck can always be practised.
    let ids = queue([...byId.keys()], states, Date.now())
    if (!ids.length) ids = [...byId.keys()]
    runSession(
      ids.map((id) => ({ deck, card: byId.get(id)! })),
      s,
    )
  })
}

/** Clozes reveal on click as well as on focus, and stay revealed. */
export function setupClozes(): void {
  document.querySelectorAll<HTMLElement>(".prose .cloze:not([data-bound])").forEach((c) => {
    c.dataset.bound = ""
    c.addEventListener("click", () => c.classList.toggle("revealed"))
  })
}
