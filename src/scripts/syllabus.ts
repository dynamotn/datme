/**
 * The lessons of a syllabus a reader has ticked as done, kept in their
 * browser per course, and the progress they make.
 */
import { loadTicks, saveTicks } from "./ticks"

/** The lessons done in a course, by id. */
export const loadDone = (path: string): string[] => loadTicks("syllabus", path) ?? []

export const saveDone = (path: string, done: string[]): void => saveTicks("syllabus", path, done.length ? done : null)

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
