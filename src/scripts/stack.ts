/**
 * Stacked notes, after Andy Matuschak: with the mode on, an internal link in a
 * note opens its target as a new column to the right instead of navigating.
 * The open columns live in ?stack=… so a stack can be shared.
 */
const root = document.documentElement
const cache = new Map<string, Promise<Element | null>>()

function fetchColumn(url: string): Promise<Element | null> {
  let hit = cache.get(url)
  if (!hit) {
    hit = fetch(url)
      .then((r) => (r.ok ? r.text() : null))
      .then((html) => (html ? new DOMParser().parseFromString(html, "text/html").querySelector("[data-stack-col]") : null))
      .catch(() => null)
    cache.set(url, hit)
  }
  return hit
}

const enabled = () => root.classList.contains("stack-mode") && matchMedia("(min-width: 900px)").matches
const columns = (row: Element) => [...row.querySelectorAll<HTMLElement>(":scope > [data-stack-col]")]

function syncUrl(row: Element) {
  const url = new URL(location.href)
  url.searchParams.delete("stack")
  for (const col of columns(row).slice(1)) url.searchParams.append("stack", col.dataset.url!)
  history.replaceState(history.state, "", url)
  root.classList.toggle("stacking", columns(row).length > 1)
}

/** Open `url` right after `from`, closing whatever was to its right. */
export async function openColumn(row: Element, from: Element, url: string, hooks: () => void) {
  const cols = columns(row)
  const existing = cols.find((c) => c.dataset.url === url)
  if (existing) return existing.scrollIntoView({ behavior: "smooth", inline: "nearest" })
  cols.slice(cols.indexOf(from as HTMLElement) + 1).forEach((c) => c.remove())
  const fetched = await fetchColumn(url)
  if (!fetched) return void (location.href = url)
  const col = document.importNode(fetched, true) as HTMLElement
  // Ids must stay unique on the page; the column keeps its own anchors as data.
  col.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"))
  // Only one element per page may carry a view-transition name.
  col.querySelectorAll("[data-astro-transition-scope]").forEach((el) => el.removeAttribute("data-astro-transition-scope"))
  const close = document.createElement("button")
  close.className = "icon-btn stack-close"
  close.type = "button"
  close.textContent = "×"
  close.setAttribute("aria-label", "Close")
  close.addEventListener("click", () => {
    columns(row)
      .slice(columns(row).indexOf(col))
      .forEach((c) => c.remove())
    syncUrl(row)
  })
  col.prepend(close)
  row.append(col)
  columns(row).forEach((c, i) => c.style.setProperty("--i", String(i)))
  syncUrl(row)
  hooks()
  col.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" })
}

export function setupStack(hooks: () => void) {
  const row = document.querySelector("[data-stack-row]")
  if (!row || row.hasAttribute("data-bound")) return
  row.setAttribute("data-bound", "")
  root.classList.remove("stacking")
  // Capture phase, so the click never reaches Astro's router.
  row.addEventListener(
    "click",
    (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.internal")
      const me = e as MouseEvent
      if (!a || !enabled() || me.metaKey || me.ctrlKey || me.shiftKey || me.button !== 0) return
      const href = new URL(a.href)
      if (href.origin !== location.origin || href.pathname === location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      void openColumn(row, a.closest("[data-stack-col]")!, href.pathname, hooks)
    },
    true,
  )
  const wanted = new URL(location.href).searchParams.getAll("stack")
  if (wanted.length && enabled()) {
    void (async () => {
      for (const url of wanted) await openColumn(row, columns(row).at(-1)!, url, hooks)
    })()
  }
}
