/**
 * The style a reader picks in the View menu, among those of appearance.readerSwitch, kept in
 * their browser. The <head> script of Base.astro applies it before the first paint and repeats
 * applyLook, which it cannot import; this module offers the choice and applies a new one.
 */

export const LOOK_KEY = "look"

function stored(): string | null {
  try {
    return localStorage.getItem(LOOK_KEY)
  } catch {
    // storage blocked: the page's own style
    return null
  }
}

function store(choice: string) {
  try {
    if (choice) localStorage.setItem(LOOK_KEY, choice)
    else localStorage.removeItem(LOOK_KEY)
  } catch {
    // private mode: the choice lasts for this page only
  }
}

/**
 * Draws the page of `doc` in the style `choice`, or in its own when there is no choice or the
 * page does not offer it. Only the chosen style's stylesheets load: the links of the page's own
 * are pointed at them, which keeps them blocking the first paint, and any missing are added.
 */
export function applyLook(doc: Document, choice: string | null): void {
  const root = doc.documentElement
  if (!root.dataset.readerLooks) return
  const looks = JSON.parse(root.dataset.readerLooks) as Record<string, string[]>
  const [look, ...css] = (choice && looks[choice]) || looks[root.dataset.lookOwn!]
  root.dataset.look = look
  const links = [...doc.head.querySelectorAll<HTMLLinkElement>("link[data-look-css]")]
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

/** The styles of the View menu; header nodes are swapped on navigation, so it re-binds each time. */
export function setupLookSwitch(): void {
  const group = document.querySelector<HTMLElement>("[data-look-switch]")
  if (!group || group.dataset.bound) return
  group.dataset.bound = "1"
  const inputs = [...group.querySelectorAll<HTMLInputElement>("input[data-look-pick]")]
  const choice = stored() ?? ""
  // A style no longer offered leaves the page's own checked.
  const current = inputs.some((i) => i.value === choice) ? choice : ""
  inputs.forEach((i) => (i.checked = i.value === current))
  group.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement
    if (!input.matches("[data-look-pick]")) return
    store(input.value)
    applyLook(document, input.value || null)
  })
}
