import { samePath } from "./data"
import { attachDecks } from "./slides"

const pages = new Map<string, Promise<Document | null>>()

function fetchPage(url: string) {
  let hit = pages.get(url)
  if (!hit) {
    hit = fetch(url)
      .then((r) => (r.ok ? r.text() : null))
      .then((html) => (html ? new DOMParser().parseFromString(html, "text/html") : null))
      .catch(() => null)
    pages.set(url, hit)
  }
  return hit
}

let el: HTMLElement | undefined
let timer: number | undefined

function hide() {
  clearTimeout(timer)
  el?.remove()
  el = undefined
}

async function show(link: HTMLAnchorElement) {
  const url = new URL(link.href)
  const doc = await fetchPage(url.pathname)
  const article = doc?.querySelector(".note")
  if (!article || !link.matches(":hover")) return
  hide()
  const title = article.querySelector(".note-title")?.textContent ?? ""
  const prose = article.querySelector(".prose")?.cloneNode(true) as HTMLElement | undefined
  el = document.createElement("div")
  el.className = "popover"
  const h = document.createElement("h3")
  h.textContent = title
  el.append(h)
  if (prose) {
    prose.querySelectorAll("[id]").forEach((n) => {
      n.setAttribute("data-id", n.id)
      n.removeAttribute("id")
    })
    attachDecks(prose)
    el.append(prose)
  }
  document.body.append(el)
  place(el, link)

  if (url.hash && prose) {
    const id = decodeURIComponent(url.hash.slice(1))
    const target = prose.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
    if (target) prose.style.transform = `translateY(-${target.offsetTop - prose.offsetTop}px)`
  }
}

/** Put a popover under its link, or above it when there is no room below. */
function place(pop: HTMLElement, link: HTMLElement) {
  const r = link.getBoundingClientRect()
  const w = pop.offsetWidth
  const hgt = pop.offsetHeight
  const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8)
  const below = r.bottom + 8 + hgt < window.innerHeight
  pop.style.left = `${left}px`
  pop.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - hgt - 8)}px`
}

/**
 * What a footnote reference or a citation points at on the same page: the
 * footnote without its back link, or the full reference.
 */
export function localContent(link: HTMLAnchorElement, doc: Document = document): HTMLElement | undefined {
  const id = decodeURIComponent(new URL(link.href, doc.baseURI).hash.slice(1))
  const target = id ? doc.getElementById(id) : null
  if (!target) return undefined
  const copy = target.cloneNode(true) as HTMLElement
  copy.removeAttribute("id")
  copy.querySelectorAll("[data-footnote-backref], .data-footnote-backref").forEach((b) => b.remove())
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"))
  const div = doc.createElement("div")
  div.className = "prose popover-local"
  div.innerHTML = copy.innerHTML
  return div
}

function showLocal(link: HTMLAnchorElement) {
  // A footnote already shown in the margin needs no popover.
  const sidenote = link.closest("sup")?.nextElementSibling as HTMLElement | null
  if (sidenote?.classList.contains("sidenote") && sidenote.offsetParent) return
  const content = localContent(link)
  if (!content || !link.matches(":hover")) return
  hide()
  el = document.createElement("div")
  el.className = "popover popover-small"
  el.append(content)
  document.body.append(el)
  place(el, link)
}

export function setupPopovers() {
  if (matchMedia("(pointer: coarse)").matches) return
  document.querySelectorAll<HTMLAnchorElement>(".main a.internal, .main a.note-row").forEach((a) => {
    if (a.closest(".popover") || a.classList.contains("anchor") || a.dataset.popover) return
    a.dataset.popover = "1"
    if (samePath(new URL(a.href).pathname, location.pathname)) return
    a.addEventListener("mouseenter", () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => show(a), 280)
    })
    a.addEventListener("mouseleave", hide)
  })
  document.querySelectorAll<HTMLAnchorElement>(".prose a[data-footnote-ref], .prose a.citation").forEach((a) => {
    if (a.closest(".popover") || a.dataset.popover) return
    a.dataset.popover = "1"
    a.addEventListener("mouseenter", () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => showLocal(a), 200)
    })
    a.addEventListener("mouseleave", hide)
  })
}

export { hide as hidePopover }
