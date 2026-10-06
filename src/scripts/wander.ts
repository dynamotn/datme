import { navigate } from "astro:transitions/client"
import { loadIndex } from "./data"
import { neighbour, randomOther } from "./wander-pick"

/** Open a note picked at random among the language's notes, never the current one. */
export async function openRandom(): Promise<void> {
  const lang = document.documentElement.dataset.lang ?? ""
  const index = await loadIndex(lang)
  const url = randomOther(
    index.notes.map((n) => n.u),
    location.pathname,
  )
  if (url) navigate(url)
}

/** Move to the next (j) or previous (k) note in the order of the explorer. */
export function step(by: 1 | -1): void {
  const urls = [...document.querySelectorAll<HTMLAnchorElement>(".explorer li > a:not(.folder-link)")].map((a) => new URL(a.href).pathname)
  const url = neighbour(urls, location.pathname, by)
  if (url) navigate(url)
}
