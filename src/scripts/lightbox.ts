/**
 * Images and drawings of a note open large in a dialog; arrows move between
 * them. The dialog is created on first use, so pages without images pay nothing.
 */

/** A drawing datme drew: an inline SVG, enlarged as a copy of itself. */
const drawingOf = (el: Element): SVGSVGElement | null => el.closest<SVGSVGElement>(".drawing.generated > svg")

/** Images worth enlarging: not links, not avatars. Filtered in code, as older engines lack complex :not(). */
const enlargeable = (el: Element): el is HTMLImageElement | SVGSVGElement => {
  if (!el.closest(".prose")) return false
  if (el.tagName === "IMG") return !el.closest("a") && !el.classList.contains("wm-avatar")
  // A drawing opens unless the click was on one of its links.
  return el.tagName.toLowerCase() === "svg" && !!el.parentElement?.matches(".drawing.generated")
}

let dialog: HTMLDialogElement | undefined
let images: (HTMLImageElement | SVGSVGElement)[] = []
let current = 0

/** The full-size picture: the original file, not the resized copy the page shows. */
function fullSource(img: Pick<HTMLImageElement, "src" | "getAttribute">): string {
  return img.getAttribute("src") ?? img.src
}

function labels() {
  const d = document.body.dataset
  return { close: d.close ?? "Close", prev: d.prev ?? "Previous", next: d.next ?? "Next" }
}

function build(): HTMLDialogElement {
  const l = labels()
  const el = document.createElement("dialog")
  el.className = "lightbox"
  el.innerHTML = `<figure><figcaption></figcaption></figure>`
  for (const [cls, label, text] of [
    ["lightbox-prev", l.prev, "‹"],
    ["lightbox-next", l.next, "›"],
    ["lightbox-close", l.close, "×"],
  ]) {
    const b = document.createElement("button")
    b.type = "button"
    b.className = `lightbox-btn ${cls}`
    b.setAttribute("aria-label", label)
    b.textContent = text
    el.append(b)
  }
  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement
    if (t.closest(".lightbox-prev")) show(current - 1)
    else if (t.closest(".lightbox-next")) show(current + 1)
    // A click on the backdrop or the close button closes; one on the picture does not.
    else if (t.closest(".lightbox-close") || !t.closest("figure")) el.close()
  })
  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(current - 1)
    else if (e.key === "ArrowRight") show(current + 1)
  })
  return el
}

function show(i: number) {
  if (!dialog || !images.length) return
  current = (i + images.length) % images.length
  const src = images[current]
  const figure = dialog.querySelector("figure")!
  const caption = figure.querySelector("figcaption")!
  let shown: Element
  if (src.tagName === "IMG") {
    const pic = src as HTMLImageElement
    const img = document.createElement("img")
    img.src = fullSource(pic)
    img.alt = pic.alt
    shown = img
    caption.textContent = pic.alt || pic.title || ""
  } else {
    // A copy of the drawing, links working, scaled to the dialog.
    const svg = src.cloneNode(true) as SVGSVGElement
    svg.removeAttribute("width")
    svg.removeAttribute("height")
    svg.classList.add("lightbox-drawing")
    shown = svg
    caption.textContent = src.getAttribute("aria-label") ?? ""
  }
  figure.replaceChildren(shown, caption)
  dialog.classList.toggle("single", images.length < 2)
}

function open(img: HTMLImageElement | SVGSVGElement) {
  // The dialog belongs to the page; a client-side navigation replaces the body.
  if (!dialog || !dialog.isConnected) {
    dialog = build()
    document.body.append(dialog)
  }
  images = [...document.querySelectorAll(".prose img, .prose .drawing.generated > svg")].filter(enlargeable)
  show(images.indexOf(img))
  dialog.showModal()
}

let bound = false
export function setupLightbox(): void {
  if (bound) return
  bound = true
  document.addEventListener("click", (e) => {
    const target = e.target as Element
    // A click anywhere on a drawing opens it, except on one of its links.
    const drawing = drawingOf(target)
    const el = drawing ? (target.closest("a") ? null : drawing) : target
    if (!el || !enlargeable(el) || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    open(el)
  })
}
