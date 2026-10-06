import { samePath } from "./data"

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
    el.append(prose)
  }
  document.body.append(el)

  const r = link.getBoundingClientRect()
  const w = el.offsetWidth
  const hgt = el.offsetHeight
  const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8)
  const below = r.bottom + 8 + hgt < window.innerHeight
  el.style.left = `${left}px`
  el.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - hgt - 8)}px`

  if (url.hash && prose) {
    const id = decodeURIComponent(url.hash.slice(1))
    const target = prose.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
    if (target) prose.style.transform = `translateY(-${target.offsetTop - prose.offsetTop}px)`
  }
}

export function setupPopovers() {
  if (matchMedia("(pointer: coarse)").matches) return
  document.querySelectorAll<HTMLAnchorElement>(".main a.internal, .main a.note-row").forEach((a) => {
    if (a.closest(".popover") || a.classList.contains("anchor")) return
    if (samePath(new URL(a.href).pathname, location.pathname)) return
    a.addEventListener("mouseenter", () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => show(a), 280)
    })
    a.addEventListener("mouseleave", hide)
  })
}

export { hide as hidePopover }
