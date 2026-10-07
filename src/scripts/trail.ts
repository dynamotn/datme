/**
 * Guided trails: the reader walks one trail at a time. Starting it (or
 * opening a link with `?trail=`) remembers it for the browsing session, and
 * every stop of that trail shows where the reader stands on it.
 */

const KEY = "datme-trail"

function active(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

function remember(trail: string | null) {
  try {
    if (trail) sessionStorage.setItem(KEY, trail)
    else sessionStorage.removeItem(KEY)
  } catch {
    // storage blocked: the trail lasts as long as its links carry it
  }
}

function show(trail: string | null) {
  document.querySelectorAll<HTMLElement>("[data-trail]").forEach((el) => (el.hidden = el.dataset.trail !== trail))
}

export function setupTrail() {
  const url = new URL(location.href)
  const param = url.searchParams.get("trail")
  if (param) {
    remember(param)
    // The parameter has done its job; the address stays the note's own.
    url.searchParams.delete("trail")
    history.replaceState(history.state, "", url)
  }
  show(param ?? active())
}

/** The next or previous stop of the trail on show, if any. */
export function trailStep(dir: 1 | -1): boolean {
  const nav = [...document.querySelectorAll<HTMLElement>("nav[data-trail]")].find((n) => !n.hidden)
  const link = nav?.querySelector<HTMLAnchorElement>(dir > 0 ? "[data-trail-next], [data-trail-end]" : "[data-trail-prev]")
  if (!link) return false
  link.click()
  return true
}

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement
  const start = target.closest<HTMLElement>("[data-trail-start]")
  if (start) remember(start.dataset.trailStart!)
  else if (target.closest("[data-trail-leave]")) {
    remember(null)
    show(null)
  } else if (target.closest("[data-trail-end]")) remember(null)
})
