/**
 * /practice: the flashcards of every deck of the garden in one session, due
 * cards first, and a badge in the header counting the cards due.
 */
import { collect, deckPath, hasPractised, loadDeck, queue, runSession, type Card, type CardState, type Item } from "./practice"
import { withBase } from "./base"

export interface Deck {
  /** URL of the deck's page, where its progress is kept. */
  u: string
  t: string
  g: string[]
  cards: Card[]
}

const cache = new Map<string, Promise<Deck[]>>()

/** The decks of a language with their cards, found in their HTML as on their own pages. */
export function loadDecks(lang: string): Promise<Deck[]> {
  let hit = cache.get(lang)
  if (!hit) {
    hit = fetch(withBase(`/static/cards.${lang}.json`))
      .then((r) => (r.ok ? r.json() : { decks: [] }))
      .then((data: { decks: { u: string; t: string; g: string[]; h: string }[] }) =>
        data.decks.map((d) => {
          const prose = document.createElement("div")
          prose.innerHTML = d.h
          return { u: d.u, t: d.t, g: d.g, cards: collect(prose) }
        }),
      )
      .catch(() => [])
    cache.set(lang, hit)
  }
  return hit
}

export interface PracticeFilter {
  deck?: string
  tag?: string
}

/** Cards to practise across decks: due ones first, the most overdue first, then new ones. */
export function gardenQueue(
  decks: Deck[],
  stateOf: (deck: string) => Record<string, CardState>,
  now: number,
  filter: PracticeFilter = {},
): { due: Item[]; fresh: Item[] } {
  const due: { item: Item; at: number }[] = []
  const fresh: Item[] = []
  for (const d of decks) {
    if (filter.deck && deckPath(d.u) !== deckPath(filter.deck)) continue
    if (filter.tag && !d.g.some((g) => g === filter.tag || g.startsWith(filter.tag + "/"))) continue
    const states = stateOf(d.u)
    const byId = new Map(d.cards.map((c) => [c.id, c]))
    for (const id of queue([...byId.keys()], states, now)) {
      const item = { deck: d.u, card: byId.get(id)! }
      if (states[id]) due.push({ item, at: states[id].due })
      else fresh.push(item)
    }
  }
  return { due: due.sort((a, b) => a.at - b.at).map((x) => x.item), fresh }
}

export async function setupGardenPractice(): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-garden-practice]")
  if (!root || root.dataset.bound) return
  root.dataset.bound = "1"
  const s = root.dataset
  const decks = await loadDecks(s.lang!)
  const counts = root.querySelector<HTMLElement>("[data-practice-counts]")!
  const bar = root.querySelector<HTMLElement>("[data-practice-start]")!
  const filter = (): PracticeFilter => {
    const value = (kind: string) => root.querySelector<HTMLSelectElement>(`[data-practice-filter="${kind}"]`)?.value || undefined
    return { deck: value("deck"), tag: value("tag") }
  }
  const refresh = () => {
    const { due, fresh } = gardenQueue(decks, loadDeck, Date.now(), filter())
    const items = [...due, ...fresh]
    counts.textContent = items.length ? s.counts!.replace("{due}", String(due.length)).replace("{new}", String(fresh.length)) : s.nothing!
    bar.replaceChildren()
    bar.hidden = !items.length
    if (!items.length) return
    const start = document.createElement("button")
    start.type = "button"
    start.className = "practice-start"
    start.textContent = s.start!.replace("{n}", String(items.length))
    start.addEventListener("click", () => runSession(items, s, () => (refresh(), void setupDueBadge())))
    bar.append(start)
  }
  root.querySelectorAll("[data-practice-filter]").forEach((sel) => sel.addEventListener("change", refresh))
  refresh()
}

/** The header badge: how many cards are due, once the reader has practised. Counted again on every page. */
export async function setupDueBadge(): Promise<void> {
  const badge = document.querySelector<HTMLAnchorElement>("[data-due-badge]")
  if (!badge || !hasPractised()) return
  const decks = await loadDecks(document.documentElement.dataset.lang ?? "")
  const { due } = gardenQueue(decks, loadDeck, Date.now())
  const label = (badge.dataset.label ?? "{n}").replace("{n}", String(due.length))
  badge.querySelector("span")!.textContent = String(due.length)
  badge.title = label
  badge.setAttribute("aria-label", label)
  badge.hidden = !due.length
}
