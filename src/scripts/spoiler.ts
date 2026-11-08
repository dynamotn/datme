/**
 * Inline spoilers (`||text||`) and content warnings. Without scripts a spoiler
 * shows on focus and a warning opens as a <details>; here a spoiler is a button
 * that stays revealed once pressed, and a warning a reader opened is remembered
 * per note in their browser.
 */
import { loadTicks, saveTicks } from "./ticks"

const KIND = "cw"

export function setupSpoilers(): void {
  for (const el of document.querySelectorAll<HTMLElement>(".spoiler[role=button]:not([data-bound])")) {
    el.dataset.bound = ""
    const show = () => {
      el.classList.add("revealed")
      for (const a of ["role", "aria-label", "tabindex"]) el.removeAttribute(a)
    }
    el.addEventListener("click", show)
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return
      e.preventDefault()
      show()
    })
  }
  for (const d of document.querySelectorAll<HTMLDetailsElement>("details.cw[data-cw]:not([data-bound])")) {
    d.dataset.bound = ""
    const url = d.dataset.cw!
    if (loadTicks(KIND, url)) d.open = true
    d.addEventListener("toggle", () => saveTicks(KIND, url, d.open ? ["ok"] : null))
  }
}
