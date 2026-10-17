/**
 * The notice on a note not updated for a while. Whether it shows is worked
 * out at build time and again in the browser, so a site that is not rebuilt
 * still warns once its notes grow old.
 */

const YEAR = 365.25 * 24 * 60 * 60 * 1000

/** Whether a note last updated at `since` is older than `years`, as of `now`. */
export function isOutdated(since: Date, years: number, now = new Date()): boolean {
  return now.getTime() - since.getTime() >= years * YEAR
}

export function setupOutdated(): void {
  document.querySelectorAll<HTMLElement>("[data-outdated]").forEach((el) => {
    const since = new Date(el.dataset.since ?? "")
    const after = Number(el.dataset.after)
    if (!Number.isNaN(since.getTime()) && after > 0) el.hidden = !isOutdated(since, after)
  })
}
