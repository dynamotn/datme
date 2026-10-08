import MiniSearch from "minisearch"
import { navigate } from "astro:transitions/client"
import { loadIndex, currentLang, matchesFilter, readFilters, samePath, type IndexNote } from "./data"
import { fold, esc, highlight, snippet } from "./text"
import { blend, embedQuery, loadVectors, nearest, type Near } from "./semantic"

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

/** One result: the note's title, folder and tags, and the words around the match. */
function resultHtml(n: IndexNote, terms: string[], sim?: number): string {
  const path = [n.f, ...n.g.slice(0, 3).map((g) => "#" + g)].filter(Boolean).join(" · ")
  const closeness = sim === undefined ? "" : `<span class="r-sim">≈ ${Math.round(sim * 100)}%</span>`
  return `<li><a href="${esc(n.u)}" role="option">
        <div class="r-title"><span>${n.s ?? "📝"}</span>${highlight(n.t, terms)}${closeness}</div>
        <div class="r-path">${esc(path)}</div>
        <div class="r-snippet">${highlight(snippet(n.c || n.d, terms), terms)}</div>
      </a></li>`
}

const threshold = (dialog: HTMLDialogElement) => Number(dialog.dataset.threshold) || 0.55

/** With nothing typed on a note's page: the notes closest to it in meaning, from vectors alone. */
async function showSimilar(dialog: HTMLDialogElement, list: HTMLElement, notes: IndexNote[]) {
  const vectors = await loadVectors(dialog.dataset.lang ?? currentLang())
  const here = vectors?.find((n) => samePath(n.url, location.pathname))
  if (!vectors || !here) return void (list.innerHTML = "")
  const near = nearest(here.v, vectors, 8, threshold(dialog), (url) => url === here.url)
  const byUrl = new Map(notes.map((n) => [n.u, n]))
  const items = near.flatMap((m) => (byUrl.has(m.url) ? [resultHtml(byUrl.get(m.url)!, [], m.sim)] : []))
  list.innerHTML = items.length ? `<li class="group" role="presentation">${esc(dialog.dataset.similar ?? "")}</li>${items.join("")}` : ""
  if (items.length) select(list, 0)
}

/** Notes close in meaning to a query, once the reader turned on search by meaning. */
async function byMeaning(dialog: HTMLDialogElement, q: string): Promise<Near[]> {
  const toggle = dialog.querySelector<HTMLButtonElement>("[data-search-meaning]")
  if (toggle?.getAttribute("aria-pressed") !== "true" || !dialog.dataset.model) return []
  const vectors = await loadVectors(dialog.dataset.lang ?? currentLang())
  if (!vectors) return []
  // The query vector is a unit vector of floats; note vectors are int8 (×127).
  return nearest(await embedQuery(dialog.dataset.model, q), vectors, 30, threshold(dialog), undefined, 127)
}

async function run(dialog: HTMLDialogElement, query: string) {
  const list = dialog.querySelector<HTMLElement>(".search-results")!
  if (dialog.dataset.engine === "pagefind" && (query.trim() || !dialog.dataset.similar)) return runPagefind(dialog, list, query.trim())
  if (dialog.dataset.engine === "pagefind") return showSimilar(dialog, list, (await loadIndex(dialog.dataset.lang ?? currentLang())).notes)
  const { ms, notes } = await engine(dialog.dataset.lang ?? currentLang())
  const q = query.trim()
  const filter = readFilters(dialog)
  const filtering = Boolean(filter.folder || filter.type)
  if (!q && !filtering) {
    if (dialog.dataset.similar) return showSimilar(dialog, list, notes)
    list.innerHTML = ""
    return
  }
  const terms = fold(q).split(/\s+/).filter(Boolean)
  const tagQuery = q.startsWith("#") ? fold(q.slice(1)) : null
  const all = notes.map((_, id) => ({ id, score: 0 }))
  // With filters but no query, browse every matching note.
  const found = !q ? all : tagQuery ? all.filter(({ id }) => notes[id].g.some((g) => fold(g).startsWith(tagQuery))) : ms.search(q)
  const meaning = q && !tagQuery ? await byMeaning(dialog, q) : []
  // A slower answer to an older query must not replace the newer one.
  if (dialog.querySelector("input")!.value.trim() !== q) return
  const idOf = new Map(notes.map((n, id) => [n.u, id]))
  const ranked = meaning.length
    ? blend(found.map((f) => ({ url: notes[f.id as number].u, score: f.score })), meaning, threshold(dialog)).map((url) => ({ id: idOf.get(url)! }))
    : found
  const sims = new Map(meaning.map((m) => [m.url, m.sim]))
  const hits = ranked.filter(({ id }) => id !== undefined && matchesFilter(notes[id as number], filter)).slice(0, q ? 30 : 100)
  if (!hits.length) {
    list.innerHTML = `<li class="empty">${esc(list.dataset.empty ?? "")}</li>`
    return
  }
  list.innerHTML = hits.map(({ id }) => resultHtml(notes[id as number], terms, sims.get(notes[id as number].u))).join("")
  select(list, 0)
}

/** The reader turns search by meaning on: the model is downloaded once, then every query uses it. */
function setupMeaning(dialog: HTMLDialogElement, input: HTMLInputElement) {
  const toggle = dialog.querySelector<HTMLButtonElement>("[data-search-meaning]")
  const model = dialog.dataset.model
  if (!toggle || !model) return
  const label = toggle.querySelector("span")!
  const idle = label.textContent ?? ""
  toggle.addEventListener("click", async () => {
    if (toggle.getAttribute("aria-busy") === "true") return
    if (toggle.getAttribute("aria-pressed") === "true") {
      toggle.setAttribute("aria-pressed", "false")
      return void run(dialog, input.value)
    }
    toggle.setAttribute("aria-busy", "true")
    label.textContent = toggle.dataset.loading ?? idle
    try {
      await embedQuery(model, "warm up")
      toggle.setAttribute("aria-pressed", "true")
    } catch (e) {
      console.warn("[datme] search by meaning is unavailable:", e)
    } finally {
      toggle.removeAttribute("aria-busy")
      label.textContent = idle
    }
    input.focus()
    void run(dialog, input.value)
  })
}

export function openSearch() {
  const dialog = document.querySelector<HTMLDialogElement>("[data-search-dialog]")
  if (!dialog || dialog.open) return
  const input = dialog.querySelector("input")!
  dialog.showModal()
  input.select()
  // Opened on a note with nothing typed: notes like this one.
  if (!input.value.trim() && dialog.dataset.similar) void run(dialog, "")
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
  setupMeaning(dialog, input)
  dialog.querySelectorAll("select[data-filter]").forEach((sel) => sel.addEventListener("change", () => run(dialog, input.value)))
  list.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) dialog.close()
  })
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close()
  })
}
