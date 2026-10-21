/**
 * The lessons of a syllabus a reader has ticked as done, kept in their
 * browser per course, and the progress they make.
 */
import { deckPath } from "./practice"

const KEY = "datme:syllabus:"

/** The lessons done in a course, by id. */
export function loadDone(path: string): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY + deckPath(path)) ?? "[]")
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []
  } catch {
    // unreadable or blocked storage: nothing done yet
    return []
  }
}

export function saveDone(path: string, done: string[]): void {
  try {
    if (done.length) localStorage.setItem(KEY + deckPath(path), JSON.stringify(done))
    else localStorage.removeItem(KEY + deckPath(path))
  } catch {
    // private mode: the ticks last for this visit only
  }
}

/** Tick the lessons done before, keep each new tick, and show how far the reader is. */
export function setupSyllabus(): void {
  const list = document.querySelector<HTMLElement>("ol.syllabus")
  if (!list) return
  const path = location.pathname
  const done = new Set(loadDone(path))
  const bar = document.querySelector<HTMLElement>("[data-syllabus-progress]")
  const lessons = [...list.querySelectorAll<HTMLElement>("[data-lesson]")]
  const update = () => {
    const n = lessons.filter((l) => done.has(l.dataset.lesson!)).length
    for (const l of lessons) l.classList.toggle("is-done", done.has(l.dataset.lesson!))
    if (!bar) return
    bar.querySelector("progress")!.value = n
    bar.querySelector("span")!.textContent = (bar.dataset.template ?? "{done} / {total}").replace("{done}", String(n)).replace("{total}", String(lessons.length))
    bar.hidden = false
  }
  for (const lesson of lessons) {
    const box = lesson.querySelector<HTMLInputElement>("[data-lesson-done]")!
    box.checked = done.has(lesson.dataset.lesson!)
    box.addEventListener("change", () => {
      if (box.checked) done.add(lesson.dataset.lesson!)
      else done.delete(lesson.dataset.lesson!)
      // Only lessons the course still has are kept.
      saveDone(path, lessons.map((l) => l.dataset.lesson!).filter((id) => done.has(id)))
      update()
    })
  }
  update()
}
