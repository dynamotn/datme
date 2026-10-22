/**
 * A checklist the reader ticks: the ticks kept in their browser per page, the
 * count of each section and the progress of the whole, and a button back to
 * the list as written.
 */
import { loadTicks, saveTicks } from "./ticks"

const KIND = "checklist"

export function setupChecklist(): void {
  const list = document.querySelector<HTMLElement>("[data-checklist]")
  if (!list) return
  const path = location.pathname
  const boxes = [...list.querySelectorAll<HTMLInputElement>("input[data-check]")]
  const bar = list.querySelector<HTMLElement>("[data-checklist-progress]")
  const sections = [...list.querySelectorAll<HTMLElement>("[data-checklist-section]")].map((el) => ({
    el,
    count: el.querySelector<HTMLElement>("[data-checklist-count]")!,
    boxes: boxes.filter((b) => el.contains(b)),
  }))
  // Ticks kept from an earlier visit, else the boxes as the note ticks them.
  const apply = (ticked: string[] | null) => {
    for (const b of boxes) b.checked = ticked ? ticked.includes(b.dataset.check!) : b.defaultChecked
  }
  const update = () => {
    const done = (of: HTMLInputElement[]) => of.filter((b) => b.checked).length
    for (const s of sections) {
      const n = done(s.boxes)
      s.el.classList.toggle("is-done", n === s.boxes.length)
      s.count.textContent = `${n}/${s.boxes.length}`
      s.count.hidden = false
    }
    if (!bar) return
    const n = done(boxes)
    bar.querySelector("progress")!.value = n
    bar.querySelector("span")!.textContent = (bar.dataset.template ?? "{done} / {total}").replace("{done}", String(n)).replace("{total}", String(boxes.length))
    bar.hidden = false
  }
  apply(loadTicks(KIND, path))
  for (const b of boxes) {
    b.addEventListener("change", () => {
      saveTicks(
        KIND,
        path,
        boxes.filter((x) => x.checked).map((x) => x.dataset.check!),
      )
      update()
    })
  }
  list.querySelector("[data-checklist-reset]")?.addEventListener("click", () => {
    saveTicks(KIND, path, null)
    apply(null)
    update()
  })
  update()
}
