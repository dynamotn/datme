import { openSearch, setupSearch } from "./search"
import { mountGraph, openGraph, teardownGraphs } from "./graph"
import { setupPopovers, hidePopover } from "./popover"
import { samePath } from "./data"

const root = document.documentElement

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // private mode: the setting just won't persist
  }
}
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

// ---- global shortcuts and header buttons (bound once; header nodes are swapped, so delegate) ----
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement
  if (target.closest("[data-open-search]")) openSearch()
  else if (target.closest("[data-open-graph]")) openGraph()
  else if (target.closest("[data-close-dialog]")) target.closest("dialog")?.close()
  else if (target.closest("[data-theme-toggle]")) {
    const next = root.dataset.theme === "dark" ? "light" : "dark"
    root.dataset.theme = next
    store("theme", next)
    document.dispatchEvent(new Event("themechange"))
    renderMermaid(true)
  } else if (target.closest("[data-reader-toggle]")) {
    const on = root.classList.toggle("reader")
    store("reader", on ? "1" : "0")
    syncToggles()
  } else if (target.closest("[data-nav-toggle]")) root.classList.toggle("nav-open")
  else if (root.classList.contains("nav-open") && !target.closest("[data-sidebar]")) root.classList.remove("nav-open")
})

document.addEventListener("keydown", (e) => {
  const typing = (e.target as HTMLElement).closest("input, textarea, [contenteditable]")
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === "k") (e.preventDefault(), openSearch())
  else if (mod && e.key.toLowerCase() === "g") (e.preventDefault(), openGraph())
  else if (!typing && e.key === "/") (e.preventDefault(), openSearch())
})

function syncToggles() {
  document
    .querySelectorAll("[data-reader-toggle]")
    .forEach((b) => b.setAttribute("aria-pressed", String(root.classList.contains("reader"))))
}

// ---- explorer: highlight the current page, remember open folders ----
const OPEN_KEY = "explorer-open"
function setupExplorer() {
  const explorer = document.querySelector<HTMLElement>("[data-explorer]")
  if (!explorer) return
  const open = new Set<string>(JSON.parse(read(OPEN_KEY) ?? "[]"))
  if (!explorer.dataset.bound) {
    explorer.dataset.bound = "1"
    explorer.querySelectorAll("details").forEach((d) => {
      if (open.has(d.dataset.dir!)) d.open = true
      d.addEventListener("toggle", () => {
        const set = new Set<string>(JSON.parse(read(OPEN_KEY) ?? "[]"))
        if (d.open) set.add(d.dataset.dir!)
        else set.delete(d.dataset.dir!)
        store(OPEN_KEY, JSON.stringify([...set]))
      })
    })
  }
  let active: HTMLElement | undefined
  document.querySelectorAll<HTMLAnchorElement>(".explorer a, .side-nav a, .main-nav a").forEach((a) => {
    const on = samePath(new URL(a.href).pathname, location.pathname)
    if (on) a.setAttribute("aria-current", "page")
    else a.removeAttribute("aria-current")
    if (on && a.closest(".explorer")) active = a
  })
  for (let d = active?.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true
  active?.scrollIntoView({ block: "nearest" })
}

// ---- table of contents scrollspy ----
let tocObserver: IntersectionObserver | undefined
function setupToc() {
  tocObserver?.disconnect()
  const links = new Map<string, HTMLAnchorElement>()
  document.querySelectorAll<HTMLAnchorElement>("[data-toc]").forEach((a) => links.set(a.dataset.toc!, a))
  if (!links.size) return
  const visible = new Set<string>()
  tocObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target.id)
        else visible.delete(e.target.id)
      }
      const first = [...links.keys()].find((id) => visible.has(id))
      if (!first) return
      links.forEach((a, id) => a.classList.toggle("active", id === first))
    },
    { rootMargin: "-70px 0px -55% 0px" },
  )
  links.forEach((_, id) => {
    const h = document.getElementById(id)
    if (h) tocObserver!.observe(h)
  })
}

// ---- code blocks ----
function setupCode() {
  document.querySelectorAll<HTMLPreElement>(".prose pre:not(.mermaid)").forEach((pre) => {
    if (pre.querySelector(".copy-btn")) return
    const btn = document.createElement("button")
    btn.className = "copy-btn"
    btn.type = "button"
    btn.textContent = document.body.dataset.copy ?? "Copy"
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(pre.querySelector("code")?.innerText ?? pre.innerText)
      const label = btn.textContent
      btn.textContent = document.body.dataset.copied ?? "Copied"
      setTimeout(() => (btn.textContent = label), 1400)
    })
    pre.append(btn)
  })
}

async function renderMermaid(rerender = false) {
  const blocks = [...document.querySelectorAll<HTMLElement>(".prose pre.mermaid")]
  if (!blocks.length) return
  const { default: mermaid } = await import("mermaid")
  mermaid.initialize({ startOnLoad: false, theme: root.dataset.theme === "dark" ? "dark" : "neutral" })
  for (const b of blocks) {
    b.dataset.src ??= b.textContent ?? ""
    if (rerender || !b.dataset.processed) {
      b.removeAttribute("data-processed")
      b.textContent = b.dataset.src
    }
  }
  await mermaid.run({ nodes: blocks })
}

function setupLocalGraph() {
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-graph="local"]').forEach((c) => void mountGraph(c, "local"))
}

document.addEventListener("astro:before-swap", () => {
  teardownGraphs()
  hidePopover()
  root.classList.remove("nav-open")
})

document.addEventListener("astro:page-load", () => {
  setupSearch()
  setupExplorer()
  setupToc()
  setupCode()
  setupPopovers()
  setupLocalGraph()
  syncToggles()
  void renderMermaid()
})
