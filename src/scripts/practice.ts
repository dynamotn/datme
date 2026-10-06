/**
 * Practice the flashcards of a deck note one at a time, Leitner style: a card
 * remembered moves up a box and comes back later, one forgotten starts over.
 * Progress stays in the reader's browser, per page.
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

interface Card {
  id: string
  question: string
  answer: string
}

/** Flip cards give a question and an answer; a paragraph with clozes is both, hidden then shown. */
function collect(prose: Element): Card[] {
  const cards: Card[] = []
  for (const d of prose.querySelectorAll("details.flashcard")) {
    const q = d.querySelector(":scope > summary")?.innerHTML ?? ""
    cards.push({ id: cardId(q), question: q, answer: d.querySelector(".flashcard-answer")?.innerHTML ?? "" })
  }
  for (const el of prose.querySelectorAll("p, li, td")) {
    if (!el.querySelector(".cloze") || el.closest("details.flashcard")) continue
    cards.push({ id: cardId(el.innerHTML), question: el.innerHTML, answer: el.innerHTML.replace(/class="cloze"/g, 'class="cloze revealed"') })
  }
  return cards
}

const KEY = "datme:cards:"

function load(): Record<string, CardState> {
  try {
    return JSON.parse(localStorage.getItem(KEY + location.pathname) ?? "{}")
  } catch {
    return {}
  }
}
function save(states: Record<string, CardState>) {
  try {
    localStorage.setItem(KEY + location.pathname, JSON.stringify(states))
  } catch {
    // private mode: progress lasts for this visit only
  }
}

function button(label: string, cls: string): HTMLButtonElement {
  const b = document.createElement("button")
  b.type = "button"
  b.className = cls
  b.textContent = label
  return b
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
    const states = load()
    const byId = new Map(cards.map((c) => [c.id, c]))
    // Everything is due on the first session, so a deck can always be practised.
    let ids = queue([...byId.keys()], states, Date.now())
    if (!ids.length) ids = [...byId.keys()]
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
    dialog.addEventListener("close", () => dialog.remove())
    document.body.append(dialog)

    let done = 0
    const next = () => {
      actions.replaceChildren()
      const id = ids.shift()
      if (!id) {
        progress.textContent = ""
        face.textContent = s.done!.replace("{n}", String(done))
        actions.append(button(s.close!, "practice-good"))
        actions.firstElementChild!.addEventListener("click", () => dialog.close())
        return
      }
      const card = byId.get(id)!
      progress.textContent = `${done + 1} / ${done + 1 + ids.length}`
      face.innerHTML = card.question
      const show = button(s.show!, "practice-show")
      show.addEventListener("click", () => {
        face.innerHTML = card.answer
        const again = button(s.again!, "practice-again")
        const good = button(s.good!, "practice-good")
        const answer = (remembered: boolean) => {
          states[id] = grade(states[id], remembered, Date.now())
          save(states)
          // A forgotten card comes back at the end of this session.
          if (!remembered) ids.push(id)
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
  })
}

/** Clozes reveal on click as well as on focus, and stay revealed. */
export function setupClozes(): void {
  document.querySelectorAll<HTMLElement>(".prose .cloze:not([data-bound])").forEach((c) => {
    c.dataset.bound = ""
    c.addEventListener("click", () => c.classList.toggle("revealed"))
  })
}
