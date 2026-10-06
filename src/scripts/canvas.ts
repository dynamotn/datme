/** Pan and zoom of canvas pages: drag to move, wheel or buttons to zoom, fit on load. */
export function setupCanvas() {
  const viewport = document.querySelector<HTMLElement>("[data-canvas]")
  const board = viewport?.querySelector<HTMLElement>(".canvas-board")
  if (!viewport || !board) return
  const view = { k: 1, x: 0, y: 0 }
  const apply = () => (board.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`)
  const fit = () => {
    const k = Math.min(1, viewport.clientWidth / board.offsetWidth, viewport.clientHeight / board.offsetHeight)
    view.k = k
    view.x = (viewport.clientWidth - board.offsetWidth * k) / 2
    view.y = (viewport.clientHeight - board.offsetHeight * k) / 2
    apply()
  }
  const zoomAt = (factor: number, cx: number, cy: number) => {
    const k = Math.min(3, Math.max(0.1, view.k * factor))
    view.x = cx - ((cx - view.x) * k) / view.k
    view.y = cy - ((cy - view.y) * k) / view.k
    view.k = k
    apply()
  }
  let drag: { x: number; y: number; moved: boolean } | undefined
  viewport.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest(".canvas-controls")) return
    drag = { x: e.clientX, y: e.clientY, moved: false }
  })
  viewport.addEventListener("pointermove", (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    if (!drag.moved) viewport.setPointerCapture(e.pointerId)
    drag.moved = true
    view.x += dx
    view.y += dy
    drag.x = e.clientX
    drag.y = e.clientY
    apply()
  })
  viewport.addEventListener("pointerup", () => (drag = undefined))
  // A drag must not also follow the link it started on.
  viewport.addEventListener("click", (e) => {
    if (drag?.moved) e.preventDefault()
  }, true)
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault()
      const r = viewport.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
    },
    { passive: false },
  )
  viewport.querySelectorAll<HTMLButtonElement>("[data-canvas-zoom]").forEach((b) =>
    b.addEventListener("click", () => {
      const mode = b.dataset.canvasZoom
      if (mode === "fit") return fit()
      zoomAt(mode === "in" ? 1.25 : 0.8, viewport.clientWidth / 2, viewport.clientHeight / 2)
    }),
  )
  fit()
}
