import { openSearch, setupSearch } from "./search"
import { mountGraph, openGraph, teardownGraphs } from "./graph"
import { setupPopovers, hidePopover } from "./popover"
import { samePath } from "./data"
import { setupLocked } from "./locked"
import { setupCanvas } from "./canvas"
import { setupStack } from "./stack"
import { setupWebmentions } from "./webmentions"
import { setupLightbox } from "./lightbox"
import { setupSlides } from "./slides"
import { setupPractice, setupClozes } from "./practice"
import { setupShare } from "./share"
import { setupProgress } from "./progress"
import { setupPrefs } from "./prefs"
import { openRandom, step } from "./wander"
import { revealHash } from "./tabs"
import { setupMedia } from "./media"
import { setupTrail, trailStep } from "./trail"

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
  else if (target.closest("[data-random]")) void openRandom()
  else if (target.closest("[data-close-dialog]")) target.closest("dialog")?.close()
  else if (target.closest("[data-theme-toggle]")) {
    const next = root.dataset.theme === "dark" ? "light" : "dark"
    root.dataset.theme = next
    store("theme", next)
    document.dispatchEvent(new Event("themechange"))
    // giscus lives in an iframe and only hears about theme changes by message.
    const giscus = document.querySelector<HTMLElement>(".comments .giscus")
    document
      .querySelector<HTMLIFrameElement>("iframe.giscus-frame")
      ?.contentWindow?.postMessage({ giscus: { setConfig: { theme: giscus && themed(giscus) } } }, "https://giscus.app")
    renderMermaid(true)
  } else if (target.closest("[data-sidebar-toggle]")) {
    const side = (target.closest("[data-sidebar-toggle]") as HTMLElement).dataset.sidebarToggle!
    root.classList.toggle(`hide-${side}`)
    store("sidebars", ["left", "right"].filter((x) => root.classList.contains(`hide-${x}`)).join(","))
    syncToggles()
  } else if (target.closest("[data-stack-toggle]")) {
    const on = root.classList.toggle("stack-mode")
    store("stack", on ? "1" : "0")
    if (!on) {
      document.querySelectorAll("[data-stack-row] > [data-stack-col]:not(:first-child)").forEach((c) => c.remove())
      root.classList.remove("stacking")
      const url = new URL(location.href)
      url.searchParams.delete("stack")
      history.replaceState(history.state, "", url)
    }
    syncToggles()
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
  // Single-key shortcuts only without modifiers, so browser shortcuts keep working.
  else if (!typing && !mod && !e.altKey && !document.querySelector("dialog[open]")) {
    if (e.key === "j") step(1)
    else if (e.key === "k") step(-1)
    else if (e.key === "r") void openRandom()
    else if (e.key === "n") trailStep(1)
    else if (e.key === "p") trailStep(-1)
  }
})

function syncToggles() {
  document
    .querySelectorAll("[data-stack-toggle]")
    .forEach((b) => b.setAttribute("aria-pressed", String(root.classList.contains("stack-mode"))))
  document
    .querySelectorAll<HTMLElement>("[data-sidebar-toggle]")
    .forEach((b) => b.setAttribute("aria-pressed", String(!root.classList.contains(`hide-${b.dataset.sidebarToggle}`))))
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
  // A folder's own page opens its folder too; its link sits beside its <details>.
  const own = active?.classList.contains("folder-link") ? active.parentElement?.querySelector<HTMLDetailsElement>(":scope > details") : null
  for (let d = own ?? active?.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true
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

/** The theme an embedded tool takes for the page's colour scheme, from its `data-theme-light` and `-dark`. */
function themed(el: HTMLElement): string {
  return (root.dataset.theme === "dark" ? el.dataset.themeDark : el.dataset.themeLight) ?? ""
}

/** giscus, loaded in the theme the page is in rather than the system's. */
function setupComments() {
  const host = document.querySelector<HTMLElement>(".comments .giscus:not([data-mounted])")
  if (!host) return
  host.dataset.mounted = ""
  const script = document.createElement("script")
  script.src = "https://giscus.app/client.js"
  script.async = true
  script.crossOrigin = "anonymous"
  for (const [k, v] of Object.entries(JSON.parse(host.dataset.giscus!) as Record<string, string>)) script.setAttribute(k, v)
  script.dataset.theme = themed(host)
  host.after(script)
}

async function renderMermaid(rerender = false) {
  const blocks = [...document.querySelectorAll<HTMLElement>(".prose pre.mermaid")]
  if (!blocks.length) return
  const { default: mermaid } = await import("mermaid")
  const [light, dark] = (root.dataset.mermaid ?? "neutral dark").split(" ")
  mermaid.initialize({ startOnLoad: false, theme: (root.dataset.theme === "dark" ? dark : light) as "default" })
  for (const b of blocks) {
    b.dataset.src ??= b.textContent ?? ""
    if (rerender || !b.dataset.processed) {
      b.removeAttribute("data-processed")
      b.textContent = b.dataset.src
    }
  }
  await mermaid.run({ nodes: blocks })
}

// ---- embedded tweets: the widget script only loads on pages that have one ----
function setupTweets() {
  const tweets = document.querySelectorAll<HTMLElement>(".prose blockquote.twitter-tweet")
  if (!tweets.length) return
  tweets.forEach((b) => (b.dataset.theme = root.dataset.theme === "dark" ? "dark" : "light"))
  const w = window as { twttr?: { widgets?: { load(el?: Element): void } } }
  if (w.twttr?.widgets) return w.twttr.widgets.load(document.querySelector(".prose") ?? undefined)
  if (document.querySelector("script[data-tweets]")) return
  const s = document.createElement("script")
  s.src = "https://platform.twitter.com/widgets.js"
  s.async = true
  s.dataset.tweets = ""
  document.head.append(s)
}

/** Sheet music and mind maps: their libraries load only on pages that have one. */
function renderDiagrams() {
  if (document.querySelector(".prose pre.abc")) void import("./diagrams").then((m) => m.renderAbc())
  if (document.querySelector(".prose figure.markmap")) void import("./diagrams").then((m) => m.renderMarkmaps())
}

function setupLocalGraph() {
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-graph="local"]').forEach((c) => void mountGraph(c, "local"))
}

// ---- offline reading: register the service worker, or drop one a previous config installed ----
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  if (root.dataset.offline != null) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}))
  } else {
    void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
  }
}

// ---- printing: folded callouts and lazy images would be missing on paper ----
let printOpened: HTMLDetailsElement[] = []
window.addEventListener("beforeprint", () => {
  printOpened = [...document.querySelectorAll<HTMLDetailsElement>(".prose details:not([open])")]
  printOpened.forEach((d) => (d.open = true))
  document.querySelectorAll<HTMLImageElement>('.prose img[loading="lazy"]').forEach((img) => (img.loading = "eager"))
})
window.addEventListener("afterprint", () => {
  printOpened.forEach((d) => (d.open = false))
  printOpened = []
})

document.addEventListener("themechange", () => {
  if (document.querySelector("figure.chart")) void import("./chart").then((m) => m.setupCharts())
  if (document.querySelector("[data-map][data-tiles-dark]")) void import("./map").then((m) => m.retileMaps())
})

document.addEventListener("astro:before-swap", () => {
  teardownGraphs()
  if (document.querySelector("figure.chart")) void import("./chart").then((m) => m.teardownCharts())
  if (document.querySelector("[data-map]")) void import("./map").then((m) => m.unmountMap())
  if (document.querySelector(".prose figure.markmap")) void import("./diagrams").then((m) => m.teardownMarkmaps())
  hidePopover()
  root.classList.remove("nav-open")
})

// ---- protected notes and locked parts: set up what unlocking reveals ----
function revealed() {
  setupMedia()
  setupCode()
  setupPopovers()
  setupSlides()
  renderDiagrams()
  void renderMermaid()
}

document.addEventListener("astro:page-load", () => {
  setupSearch()
  setupLocked(revealed)
  setupCanvas()
  setupStack(() => {
    setupCode()
    setupPopovers()
    setupSlides()
    renderDiagrams()
    void renderMermaid()
  })
  setupExplorer()
  setupToc()
  setupCode()
  setupPopovers()
  setupLocalGraph()
  setupTweets()
  setupLightbox()
  setupSlides()
  setupClozes()
  setupShare()
  setupProgress()
  setupPrefs()
  setupPractice()
  setupMedia()
  setupTrail()
  if (document.querySelector(".drawing.generated")) void import("./excalifont").then((m) => m.loadDrawingFonts())
  // Chart.js is only fetched on pages with a chart.
  if (document.querySelector("figure.chart")) void import("./chart").then((m) => m.setupCharts())
  // Leaflet is only fetched on pages with a map: /map, or a note with a ```leaflet block.
  const mapEls = document.querySelectorAll<HTMLElement>("[data-map]")
  if (mapEls.length) void import("./map").then((m) => mapEls.forEach((el) => m.mountMap(el)))
  void setupWebmentions()
  setupComments()
  syncToggles()
  renderDiagrams()
  void renderMermaid()
  if (document.querySelector(".tab-panel[hidden]") && location.hash) revealHash()
})

window.addEventListener("hashchange", () => {
  if (document.querySelector(".tab-panel[hidden]")) revealHash()
})
