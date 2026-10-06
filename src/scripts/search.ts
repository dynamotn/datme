import MiniSearch from "minisearch"
import { navigate } from "astro:transitions/client"
import { loadIndex, currentLang, matchesFilter, readFilters, type IndexNote } from "./data"
import { fold, esc, highlight, snippet } from "./text"

const engines = new Map<string, Promise<{ ms: MiniSearch<IndexNote & { id: number }>; notes: IndexNote[] }>>()

function engine(lang: string) {
  let hit = engines.get(lang)
  if (!hit) {
    hit = loadIndex(lang).then(({ notes }) => {
      const ms = new MiniSearch<IndexNote & { id: number }>({
        fields: ["t", "a", "g", "c"],
        storeFields: ["u"],
        processTerm: (term) => fold(term),
        searchOptions: { boost: { t: 4, a: 3, g: 2 }, prefix: true, fuzzy: 0.15, combineWith: "AND" },
        extractField: (doc, field) => {
          const v = (doc as unknown as Record<string, unknown>)[field]
          return Array.isArray(v) ? v.join(" ") : String(v ?? "")
        },
      })
      ms.addAll(notes.map((n, id) => ({ ...n, id })))
      return { ms, notes }
    })
    engines.set(lang, hit)
  }
  return hit
}

let selected = 0

function select(list: HTMLElement, i: number) {
  const items = [...list.querySelectorAll<HTMLAnchorElement>("a")]
  if (!items.length) return
  selected = (i + items.length) % items.length
  items.forEach((a, j) => a.setAttribute("aria-selected", String(j === selected)))
  items[selected].scrollIntoView({ block: "nearest" })
}

interface PagefindResult {
  url: string
  excerpt: string
  meta: { title?: string }
}
interface Pagefind {
  search(q: string | null, opts?: { filters?: Record<string, string> }): Promise<{ results: { data(): Promise<PagefindResult> }[] }>
}
let pagefind: Promise<Pagefind> | undefined

/** Pagefind's own script, written next to the site by the build; only the parts a query needs load. */
function loadPagefind(): Promise<Pagefind> {
  pagefind ??= import(/* @vite-ignore */ `${location.origin}/pagefind/pagefind.js`) as Promise<Pagefind>
  return pagefind
}

async function runPagefind(dialog: HTMLDialogElement, list: HTMLElement, q: string) {
  const filter = readFilters(dialog)
  const filters: Record<string, string> = {}
  if (filter.folder) filters.folder = filter.folder
  if (filter.type) filters.type = filter.type
  if (!q && !Object.keys(filters).length) {
    list.innerHTML = ""
    return
  }
  const pf = await loadPagefind()
  const found = await pf.search(q || null, { filters })
  const hits = await Promise.all(found.results.slice(0, 30).map((r) => r.data()))
  if (!hits.length) {
    list.innerHTML = `<li class="empty">${esc(list.dataset.empty ?? "")}</li>`
    return
  }
  // Pagefind's excerpts are page text with <mark> around the matches.
  list.innerHTML = hits
    .map(
      (h) => `<li><a href="${esc(h.url)}" role="option">
        <div class="r-title"><span>📝</span>${esc(h.meta.title ?? h.url)}</div>
        <div class="r-snippet">${h.excerpt}</div>
      </a></li>`,
    )
    .join("")
  select(list, 0)
}

async function run(dialog: HTMLDialogElement, query: string) {
  const list = dialog.querySelector<HTMLElement>(".search-results")!
  if (dialog.dataset.engine === "pagefind") return runPagefind(dialog, list, query.trim())
  const { ms, notes } = await engine(dialog.dataset.lang ?? currentLang())
  const q = query.trim()
  const filter = readFilters(dialog)
  const filtering = Boolean(filter.folder || filter.type)
  if (!q && !filtering) {
    list.innerHTML = ""
    return
  }
  const terms = fold(q).split(/\s+/).filter(Boolean)
  const tagQuery = q.startsWith("#") ? fold(q.slice(1)) : null
  const all = notes.map((_, id) => ({ id }))
  // With filters but no query, browse every matching note.
  const found = !q ? all : tagQuery ? all.filter(({ id }) => notes[id].g.some((g) => fold(g).startsWith(tagQuery))) : ms.search(q)
  const hits = found.filter(({ id }) => matchesFilter(notes[id as number], filter)).slice(0, q ? 30 : 100)
  if (!hits.length) {
    list.innerHTML = `<li class="empty">${esc(list.dataset.empty ?? "")}</li>`
    return
  }
  list.innerHTML = hits
    .map(({ id }) => {
      const n = notes[id as number]
      const path = [n.f, ...n.g.slice(0, 3).map((g) => "#" + g)].filter(Boolean).join(" · ")
      return `<li><a href="${esc(n.u)}" role="option">
        <div class="r-title"><span>${n.s ?? "📝"}</span>${highlight(n.t, terms)}</div>
        <div class="r-path">${esc(path)}</div>
        <div class="r-snippet">${highlight(snippet(n.c || n.d, terms), terms)}</div>
      </a></li>`
    })
    .join("")
  select(list, 0)
}

export function openSearch() {
  const dialog = document.querySelector<HTMLDialogElement>("[data-search-dialog]")
  if (!dialog || dialog.open) return
  const input = dialog.querySelector("input")!
  dialog.showModal()
  input.select()
  if (dialog.dataset.engine === "pagefind") void loadPagefind()
  else void engine(dialog.dataset.lang ?? currentLang())
}

export function setupSearch() {
  const dialog = document.querySelector<HTMLDialogElement>("[data-search-dialog]")
  if (!dialog || dialog.dataset.bound) return
  dialog.dataset.bound = "1"
  const input = dialog.querySelector("input")!
  const list = dialog.querySelector<HTMLElement>(".search-results")!
  let timer: number | undefined
  input.addEventListener("input", () => {
    clearTimeout(timer)
    timer = window.setTimeout(() => run(dialog, input.value), 60)
  })
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") (e.preventDefault(), select(list, selected + 1))
    else if (e.key === "ArrowUp") (e.preventDefault(), select(list, selected - 1))
    else if (e.key === "Enter") {
      const a = list.querySelectorAll<HTMLAnchorElement>("a")[selected]
      if (a) (e.preventDefault(), dialog.close(), navigate(a.getAttribute("href")!))
    }
  })
  dialog.querySelectorAll("select[data-filter]").forEach((sel) => sel.addEventListener("change", () => run(dialog, input.value)))
  list.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) dialog.close()
  })
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close()
  })
}
