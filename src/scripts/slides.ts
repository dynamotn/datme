/**
 * Marp decks: their slides live in a declarative shadow root, which only the
 * HTML parser sets up, so a deck that arrives another way (page swaps,
 * unlocking, popovers) gets it attached here. Each deck gets a button that
 * presents it one slide at a time, full screen where the browser allows.
 */

let presenting: { host: HTMLElement; slides: SVGSVGElement[]; at: number } | undefined

function attach(host: Element): ShadowRoot | null {
  if (host.shadowRoot) return host.shadowRoot
  const template = host.querySelector<HTMLTemplateElement>(":scope > template[shadowrootmode]")
  if (!template) return null
  const root = host.attachShadow({ mode: "open" })
  root.append(template.content.cloneNode(true))
  template.remove()
  return root
}

function show(at: number) {
  if (!presenting) return
  const { slides } = presenting
  presenting.at = Math.max(0, Math.min(slides.length - 1, at))
  slides.forEach((s, i) => s.classList.toggle("current", i === presenting!.at))
}

function stop() {
  if (!presenting) return
  const { host, slides, at } = presenting
  presenting = undefined
  host.classList.remove("presenting")
  slides.forEach((s) => s.classList.remove("current"))
  if (document.fullscreenElement === host) void document.exitFullscreen().catch(() => {})
  slides[at]?.scrollIntoView({ block: "center" })
}

function start(host: HTMLElement) {
  const slides = [...(host.shadowRoot?.querySelectorAll<SVGSVGElement>(".marpit > svg[data-marpit-svg]") ?? [])]
  if (!slides.length) return
  // Begin at the slide the reader is looking at.
  const mid = innerHeight / 2
  const near = slides.reduce(
    (best, s, i) => {
      const r = s.getBoundingClientRect()
      const d = Math.abs((r.top + r.bottom) / 2 - mid)
      return d < best.d ? { i, d } : best
    },
    { i: 0, d: Infinity },
  )
  presenting = { host, slides, at: 0 }
  host.classList.add("presenting")
  show(near.i)
  // iOS Safari has no element full screen; the fixed overlay still covers the page.
  host.requestFullscreen?.().catch(() => {})
}

document.addEventListener("keydown", (e) => {
  if (!presenting || e.altKey || e.ctrlKey || e.metaKey) return
  const keys: Record<string, () => void> = {
    ArrowRight: () => show(presenting!.at + 1),
    ArrowDown: () => show(presenting!.at + 1),
    PageDown: () => show(presenting!.at + 1),
    " ": () => show(presenting!.at + (e.shiftKey ? -1 : 1)),
    ArrowLeft: () => show(presenting!.at - 1),
    ArrowUp: () => show(presenting!.at - 1),
    PageUp: () => show(presenting!.at - 1),
    Home: () => show(0),
    End: () => show(presenting!.slides.length - 1),
    Escape: stop,
  }
  const run = keys[e.key]
  if (!run) return
  e.preventDefault()
  run()
})

// Leaving full screen with the browser's own controls ends the presentation too.
document.addEventListener("fullscreenchange", () => {
  if (presenting && document.fullscreenElement !== presenting.host) stop()
})

/** Give the decks under `root` their slides, for copies of a page such as popovers. */
export function attachDecks(root: ParentNode) {
  root.querySelectorAll(".marp-deck").forEach(attach)
}

export function setupSlides() {
  if (presenting && !presenting.host.isConnected) presenting = undefined
  document.querySelectorAll<HTMLElement>(".marp-deck").forEach((host) => {
    const root = attach(host)
    if (!root || host.dataset.bound) return
    host.dataset.bound = "1"
    // Links on a slide keep working; a click elsewhere moves on, or back on the left third.
    root.addEventListener("click", (e) => {
      if (presenting?.host !== host || (e.target as Element).closest("a")) return
      show(presenting.at + ((e as MouseEvent).clientX < innerWidth / 3 ? -1 : 1))
    })
    // A deck shown inside another page (an embed, a popover) is read, not presented.
    if (host.closest(".transclude, .popover")) return
    const button = document.createElement("button")
    button.type = "button"
    button.className = "present-button"
    button.textContent = host.dataset.present ?? "Present"
    button.addEventListener("click", () => start(host))
    host.before(button)
  })
}
