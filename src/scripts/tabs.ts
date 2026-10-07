/** Tabs of ```tabs blocks: the buttons are built at build time, this only switches panels. */

function select(tab: HTMLElement, focus = false) {
  const list = tab.closest("[role=tablist]")
  const box = tab.closest<HTMLElement>("[data-tabs]")
  if (!list || !box) return
  for (const t of list.querySelectorAll<HTMLElement>("[role=tab]")) {
    const on = t === tab
    t.setAttribute("aria-selected", String(on))
    t.tabIndex = on ? 0 : -1
    const panel = document.getElementById(t.getAttribute("aria-controls") ?? "")
    if (panel?.parentElement === box) panel.hidden = !on
  }
  if (focus) tab.focus()
}

document.addEventListener("click", (e) => {
  const tab = (e.target as HTMLElement).closest<HTMLElement>("[data-tabs] [role=tab]")
  if (tab) select(tab)
})

document.addEventListener("keydown", (e) => {
  const tab = (e.target as HTMLElement).closest<HTMLElement>("[data-tabs] [role=tab]")
  if (!tab) return
  const tabs = [...tab.parentElement!.querySelectorAll<HTMLElement>("[role=tab]")]
  const i = tabs.indexOf(tab)
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
  if (next === undefined) return
  e.preventDefault()
  select(tabs[(next + tabs.length) % tabs.length], true)
})

/** A link to something inside a hidden tab opens that tab first. */
export function revealHash() {
  let id = ""
  try {
    id = decodeURIComponent(location.hash.slice(1))
  } catch {
    return
  }
  const target = id && document.getElementById(id)
  if (!target) return
  let panel = target.closest<HTMLElement>(".tab-panel[hidden]")
  while (panel) {
    const tab = document.getElementById(panel.getAttribute("aria-labelledby") ?? "")
    if (tab) select(tab)
    panel = panel.parentElement?.closest<HTMLElement>(".tab-panel[hidden]") ?? null
  }
  target.scrollIntoView()
}
