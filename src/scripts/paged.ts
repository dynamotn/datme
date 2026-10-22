/**
 * Paged reading of the e-ink style: the note is laid out in columns as tall
 * as the screen (eink.css), and this turns them one at a time with Page
 * Up/Down, the arrow keys, a tap on either edge of the page, or the buttons
 * under it. The text stays one article in reading order, so screen readers
 * and find-in-page read it as ever; a link reached with Tab turns to its page.
 * The View menu's toggle keeps the choice in the reader's browser, and the
 * <head> script of Base.astro applies it before the first paint.
 */

export const PAGED_KEY = "paged"

/** Pages of a box `width` wide, `gap` between its columns, whose columns run `scrollWidth` in all. */
export function pageCount(scrollWidth: number, width: number, gap: number): number {
  if (width <= 0) return 1
  return Math.max(1, Math.round((scrollWidth + gap) / (width + gap)))
}

/** The page a box at offset `left` of its columns from the start of the first shows. */
export function pageAt(left: number, width: number, gap: number): number {
  return width <= 0 ? 0 : Math.max(0, Math.floor((left + gap / 2) / (width + gap)))
}

/** Where a key turns: -1 back, 1 forward, 0 not a page key. Left and right swap in right-to-left text. */
export function keyTurn(e: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">, rtl = false): -1 | 0 | 1 {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return 0
  if (e.key === "PageDown") return 1
  if (e.key === "PageUp") return -1
  if (e.key === "ArrowRight") return rtl ? -1 : 1
  if (e.key === "ArrowLeft") return rtl ? 1 : -1
  return 0
}

/** Where a tap at `x` across a page from `left`, `width` wide, turns: the outer fifth of either side, as on an e-reader. */
export function tapTurn(x: number, left: number, width: number, rtl = false): -1 | 0 | 1 {
  const at = (x - left) / width
  if (at < 0.2) return rtl ? 1 : -1
  if (at > 0.8) return rtl ? -1 : 1
  return 0
}

function stored(): boolean {
  try {
    return localStorage.getItem(PAGED_KEY) === "1"
  } catch {
    // storage blocked: the page scrolls
    return false
  }
}

function store(on: boolean) {
  try {
    if (on) localStorage.setItem(PAGED_KEY, "1")
    else localStorage.removeItem(PAGED_KEY)
  } catch {
    // private mode: the choice lasts for this page only
  }
}

const root = document.documentElement
let page = 0
let observer: MutationObserver | undefined
let bound = false

/** The note being paged, when the page is in the e-ink style with paging on; undefined otherwise. */
function pagedNote(): HTMLElement | undefined {
  const note = document.querySelector<HTMLElement>("article.note")
  if (!note || !document.querySelector("[data-paged-bar]")) return undefined
  return root.classList.contains("paged") && root.dataset.look === "eink" ? note : undefined
}

const rtlOf = (el: HTMLElement) => getComputedStyle(el).direction === "rtl"
const gapOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).columnGap) || 0

/** Show page `to` of the note, kept within its pages, and say which it is under it. */
function show(note: HTMLElement, to: number) {
  const gap = gapOf(note)
  const total = pageCount(note.scrollWidth, note.clientWidth, gap)
  page = Math.min(total - 1, Math.max(0, to))
  // Columns run leftwards in right-to-left text, where scrollLeft counts down from 0.
  note.scrollLeft = (rtlOf(note) ? -1 : 1) * page * (note.clientWidth + gap)
  const bar = document.querySelector<HTMLElement>("[data-paged-bar]")!
  const count = bar.querySelector<HTMLElement>("[data-paged-count]")!
  count.textContent = (count.dataset.template ?? "{n} / {total}").replace("{n}", String(page + 1)).replace("{total}", String(total))
  bar.querySelector<HTMLButtonElement>("[data-paged-prev]")!.disabled = page === 0
  bar.querySelector<HTMLButtonElement>("[data-paged-next]")!.disabled = page === total - 1
}

/** Lay the note out paged or not, as the toggle and the page's style say, and sync the toggle. */
function refresh() {
  const note = pagedNote()
  const bar = document.querySelector<HTMLElement>("[data-paged-bar]")
  document.querySelectorAll("[data-paged-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(root.classList.contains("paged"))))
  document.querySelector("article.note")?.classList.toggle("is-paged", !!note)
  if (bar) bar.hidden = !note
  if (note) show(note, page)
}

/** Turn `by` pages, when the note is paged. */
export function turn(by: number): boolean {
  const note = pagedNote()
  if (!note) return false
  show(note, page + by)
  return true
}

function onKey(e: KeyboardEvent) {
  const note = pagedNote()
  if (!note || document.querySelector("dialog[open]")) return
  if ((e.target as Element).closest?.("input, textarea, select, [contenteditable]")) return
  const by = keyTurn(e, rtlOf(note))
  if (!by) return
  e.preventDefault()
  show(note, page + by)
}

function onClick(e: MouseEvent) {
  const target = e.target as Element
  const toggle = target.closest?.("[data-paged-toggle]")
  if (toggle) {
    const on = root.classList.toggle("paged")
    store(on)
    page = 0
    refresh()
    return
  }
  if (target.closest?.("[data-paged-prev]")) return void turn(-1)
  if (target.closest?.("[data-paged-next]")) return void turn(1)
  const note = pagedNote()
  // A tap on a link, a button or a field does what it does; selecting text turns nothing.
  if (!note || !note.contains(target) || target.closest("a, button, input, select, textarea, summary, label, [tabindex]")) return
  if (window.getSelection()?.toString()) return
  const box = note.getBoundingClientRect()
  const by = tapTurn(e.clientX, box.left, box.width, rtlOf(note))
  if (by) show(note, page + by)
}

/** A link or a field reached with Tab is on another page: turn to it. */
function onFocus(e: FocusEvent) {
  const note = pagedNote()
  const target = e.target as HTMLElement
  if (!note || !note.contains(target) || target === note) return
  const box = note.getBoundingClientRect()
  const gap = gapOf(note)
  const rtl = rtlOf(note)
  const offset = rtl ? box.right - target.getBoundingClientRect().right : target.getBoundingClientRect().left - box.left
  show(note, pageAt(offset + Math.abs(note.scrollLeft), note.clientWidth, gap))
}

/** Bind the toggle, keys and taps once, and lay out each page as it loads. */
export function setupPaged(): void {
  page = 0
  observer?.disconnect()
  root.classList.toggle("paged", stored())
  refresh()
  // The reader switch can change the page's style, and the toggle its class.
  observer = new MutationObserver(refresh)
  observer.observe(root, { attributes: true, attributeFilter: ["data-look"] })
  if (bound) return
  bound = true
  document.addEventListener("keydown", onKey)
  document.addEventListener("click", onClick)
  document.addEventListener("focusin", onFocus)
  window.addEventListener("resize", refresh)
}
