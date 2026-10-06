/**
 * Images of a note open large in a dialog; arrows move between the images of
 * the page. The dialog is created on first use, so pages without images pay nothing.
 */

/** Images worth enlarging: not links, not avatars. Filtered in code, as older engines lack complex :not(). */
const enlargeable = (img: Element): img is HTMLImageElement =>
  img.tagName === "IMG" && !!img.closest(".prose") && !img.closest("a") && !img.classList.contains("wm-avatar")

let dialog: HTMLDialogElement | undefined
let images: HTMLImageElement[] = []
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
  el.innerHTML = `<figure><img alt=""><figcaption></figcaption></figure>`
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
  const img = dialog.querySelector("img")!
  img.src = fullSource(src)
  img.alt = src.alt
  dialog.querySelector("figcaption")!.textContent = src.alt || src.title || ""
  dialog.classList.toggle("single", images.length < 2)
}

function open(img: HTMLImageElement) {
  // The dialog belongs to the page; a client-side navigation replaces the body.
  if (!dialog || !dialog.isConnected) {
    dialog = build()
    document.body.append(dialog)
  }
  images = [...document.querySelectorAll(".prose img")].filter(enlargeable)
  show(images.indexOf(img))
  dialog.showModal()
}

let bound = false
export function setupLightbox(): void {
  if (bound) return
  bound = true
  document.addEventListener("click", (e) => {
    const img = e.target as Element
    if (!enlargeable(img) || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    open(img)
  })
}
