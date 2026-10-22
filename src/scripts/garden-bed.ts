/**
 * The garden bed of the garden style: filter chips, a tag select, the cap on
 * the home page and relative "tended" dates. Without JavaScript every tile
 * shows and the controls stay hidden.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** "3 days ago" for a date within the last 30 days; undefined when older or in the future. */
export function relativeTended(since: Date, lang: string, now = new Date()): string | undefined {
  const age = now.getTime() - since.getTime()
  if (Number.isNaN(age) || age < 0 || age > 30 * DAY) return undefined
  try {
    const fmt = new Intl.RelativeTimeFormat(lang, { numeric: "auto" })
    return age < DAY ? fmt.format(-Math.floor(age / HOUR), "hour") : fmt.format(-Math.floor(age / DAY), "day")
  } catch {
    return undefined
  }
}

export interface Tile {
  stage: string
  folder: string
  tags: string[]
}
export interface Filter {
  stage?: string
  folder?: string
  tag?: string
}

/** Whether a tile passes every filter that is set. */
export function tileMatches(tile: Tile, filter: Filter): boolean {
  return (!filter.stage || tile.stage === filter.stage) && (!filter.folder || tile.folder === filter.folder) && (!filter.tag || tile.tags.includes(filter.tag))
}

function setupBed(root: HTMLElement): void {
  const tiles = [...root.querySelectorAll<HTMLElement>(".garden-tile")]
  const chips = [...root.querySelectorAll<HTMLButtonElement>("[data-garden-chip]")]
  const select = root.querySelector<HTMLSelectElement>("[data-garden-tag]")
  const more = root.querySelector<HTMLButtonElement>("[data-garden-more]")
  const cap = Number(root.dataset.cap) > 0 ? Number(root.dataset.cap) : Infinity
  const filter: Filter = {}
  let capped = true

  const render = () => {
    const filtered = Boolean(filter.stage || filter.folder || filter.tag)
    let shown = 0
    let hiddenByCap = false
    for (const tile of tiles) {
      const match = tileMatches(
        { stage: tile.dataset.stage ?? "", folder: tile.dataset.folder ?? "", tags: (tile.dataset.tags ?? "").split(/\s+/).filter(Boolean) },
        filter,
      )
      const over = match && !filtered && capped && shown >= cap
      if (match && !over) shown++
      if (over) hiddenByCap = true
      tile.hidden = !match || over
    }
    if (more) more.hidden = !hiddenByCap
  }

  root.querySelector<HTMLElement>("[data-garden-filters]")?.removeAttribute("hidden")
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      delete filter.stage
      delete filter.folder
      if (chip.dataset.kind === "stage") filter.stage = chip.dataset.value
      else if (chip.dataset.kind === "folder") filter.folder = chip.dataset.value
      for (const c of chips) c.setAttribute("aria-pressed", String(c === chip))
      render()
    })
  }
  select?.addEventListener("change", () => {
    if (select.value) filter.tag = select.value
    else delete filter.tag
    render()
  })
  more?.addEventListener("click", () => {
    capped = false
    render()
  })
  render()
}

export function setupGardenBed(): void {
  document.querySelectorAll<HTMLElement>("[data-garden]").forEach((root) => {
    if (root.dataset.bound) return
    root.dataset.bound = "1"
    setupBed(root)
  })
  const lang = document.documentElement.lang || "en"
  document.querySelectorAll<HTMLTimeElement>("time[data-tended]").forEach((el) => {
    const text = relativeTended(new Date(el.dateTime), lang)
    if (text) el.textContent = text
  })
}
