import type { Lang } from "../site.config"
import { listed, type Note } from "./vault"

/** Flashcard decks readers can practise: listed, and not protected, whose cards are secret. */
export function decks(lang: Lang): Note[] {
  return listed(lang).filter((n) => n.deck && !n.protected)
}

export const hasDecks = (lang: Lang) => decks(lang).length > 0
