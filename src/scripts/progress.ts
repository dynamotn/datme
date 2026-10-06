/** Words read per minute, as for the reading time shown on notes. */
const WPM = 220

/** How far through an element a reader is, from 0 to 1, given where it sits on the page. */
export function progressOf(scrollY: number, top: number, height: number, viewport: number): number {
  const span = height - viewport
  if (span <= 0) return scrollY + viewport >= top + height ? 1 : 0
  return Math.min(1, Math.max(0, (scrollY - top) / span))
}

/** Whole minutes left of a note of `words` words once `progress` of it is read. */
export function minutesLeft(words: number, progress: number): number {
  return Math.ceil((words * (1 - progress)) / WPM)
}

let frame = 0
let onScroll: (() => void) | undefined

/** Fill the bar of a long note as the reader scrolls through it, with the time left. */
export function setupProgress(): void {
  if (onScroll) window.removeEventListener("scroll", onScroll)
  onScroll = undefined
  const bar = document.querySelector<HTMLElement>("[data-progress]")
  const article = document.querySelector<HTMLElement>("article.note")
  if (!bar || !article) return
  const words = Number(bar.dataset.words)
  const fill = bar.querySelector<HTMLElement>(".reading-progress-fill")!
  const label = bar.querySelector<HTMLElement>(".reading-progress-left")!
  const template = bar.dataset.left ?? "{n} min left"
  const update = () => {
    frame = 0
    const top = article.getBoundingClientRect().top + window.scrollY
    const p = progressOf(window.scrollY, top, article.offsetHeight, window.innerHeight)
    fill.style.transform = `scaleX(${p})`
    const left = minutesLeft(words, p)
    label.textContent = template.replace("{n}", String(left))
    label.hidden = p <= 0.02 || left <= 0
  }
  onScroll = () => {
    frame ||= requestAnimationFrame(update)
  }
  window.addEventListener("scroll", onScroll, { passive: true })
  update()
}
