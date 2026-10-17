import katexCss from "katex/dist/katex.min.css?url"

/**
 * Pages link only the stylesheets they need (src/layouts/Base.astro): KaTeX's
 * when they hold math, and their own look's. Two things follow in the browser.
 *
 * Math can arrive after the page: a popover, a stacked note, a deck or a
 * locked part. KaTeX's stylesheet is linked once some does.
 *
 * Navigating to a page of another look, or with math, adds that stylesheet
 * at the end of <head>, after the ones kept from the page before. The
 * cascade wants them in their order (KaTeX, the base, the look, print), so
 * a newcomer moves back into its place before the page shows.
 */

const linked = () => !!document.querySelector(`link[rel="stylesheet"][href="${katexCss}"]`)

function linkKatex() {
  if (linked()) return
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = katexCss
  link.dataset.css = "1"
  const next = document.querySelector('head link[data-css="2"]')
  if (next) next.before(link)
  else document.head.append(link)
}

let watching: MutationObserver | undefined
function watchMath() {
  if (linked()) return void watching?.disconnect()
  if (document.querySelector(".katex")) return linkKatex()
  if (watching || !("MutationObserver" in window)) return
  watching = new MutationObserver((records) => {
    for (const r of records)
      for (const n of r.addedNodes)
        if (n instanceof Element && (n.classList.contains("katex") || n.querySelector(".katex"))) {
          linkKatex()
          watching?.disconnect()
          watching = undefined
          return
        }
  })
  watching.observe(document.body, { childList: true, subtree: true })
}

/**
 * Puts the ordered stylesheets of <head> back in their order. Those kept
 * from the page before are in order already; a newcomer, after one that
 * should follow it, moves in front of it. Kept ones never move, which would
 * load them again.
 */
export function orderStyles(head: HTMLElement = document.head) {
  const order = (l: HTMLLinkElement) => Number(l.dataset.css)
  for (const link of [...head.querySelectorAll<HTMLLinkElement>("link[data-css]")]) {
    const after = [...head.querySelectorAll<HTMLLinkElement>("link[data-css]")].find((l) => l !== link && order(l) > order(link))
    if (after && after.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) after.before(link)
  }
}

document.addEventListener("astro:after-swap", () => {
  orderStyles()
  // The body was replaced: watch the new one.
  watching?.disconnect()
  watching = undefined
})
document.addEventListener("astro:page-load", watchMath)
