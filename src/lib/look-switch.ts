import { PAGE_STYLES, site, type Style } from "../site.config"

/** How the reader switch draws each style it offers: the `data-look` it sets, then the stylesheets it links. */
export type LookSheets = Record<string, string[]>

/**
 * The styles a reader can pick on a page drawn in `own`, with what draws each, the page's own
 * included so the reader can go back to it. None when the switch is off or the page's style is
 * made for a single page: a résumé stays a résumé.
 */
export function readerLooks(own: Style, sheets: Partial<Record<Style, string>>, choices: readonly Style[] = site.appearance.readerSwitch): LookSheets | undefined {
  if (!choices.length || PAGE_STYLES.includes(own)) return undefined
  return Object.fromEntries([own, ...choices].map((st) => [st, [st, ...(sheets[st] ? [sheets[st]] : [])]]))
}

/**
 * The <head> script of a page with the reader switch: draws it in the reader's stored style before
 * the first paint, and the next page before it is swapped in. It repeats applyLook of
 * src/scripts/looks.ts, which an inline script cannot import.
 */
export const LOOK_SCRIPT = `(() => {
  const apply = (doc) => {
    const root = doc.documentElement
    if (!root.dataset.readerLooks) return
    let choice = null
    try {
      choice = localStorage.getItem("look")
    } catch {}
    const looks = JSON.parse(root.dataset.readerLooks)
    const [look, ...css] = (choice && looks[choice]) || looks[root.dataset.lookOwn]
    root.dataset.look = look
    const links = [...doc.head.querySelectorAll("link[data-look-css]")]
    let prev = doc.head.querySelector('link[data-css="2"]')
    css.forEach((href, i) => {
      let link = links[i]
      if (!link) {
        link = doc.createElement("link")
        link.rel = "stylesheet"
        link.dataset.css = "3"
        link.dataset.lookCss = ""
        link.setAttribute("blocking", "render")
        if (prev) prev.after(link)
        else doc.head.append(link)
      }
      if (link.getAttribute("href") !== href) link.setAttribute("href", href)
      prev = link
    })
    links.slice(css.length).forEach((l) => l.remove())
  }
  apply(document)
  document.addEventListener("astro:before-swap", (e) => apply(e.newDocument))
})()`
