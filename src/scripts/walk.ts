/**
 * Generated walks: a reader asks for a path from the note they are on to
 * another, and walks it stop by stop like an author's trail. The path is the
 * shortest chain of links, followed both ways, over the published notes the
 * graph knows. It lives in the browsing session, and a link can share it.
 */
import { navigate } from "astro:transitions/client"
import { loadGraph, samePath, type GraphIndex } from "./data"

const KEY = "datme-walk"
const PARAM = "walk"

/** The shortest path of links from one note to another, as indices, or undefined when none leads there. */
export function shortestPath(links: [number, number][], count: number, from: number, to: number): number[] | undefined {
  if (from === to) return [from]
  const near: number[][] = Array.from({ length: count }, () => [])
  for (const [a, b] of links) near[a].push(b), near[b].push(a)
  const before = new Map<number, number>([[from, -1]])
  const queue = [from]
  while (queue.length) {
    const at = queue.shift()!
    for (const next of near[at]) {
      if (before.has(next)) continue
      before.set(next, at)
      if (next === to) {
        const path = [to]
        for (let p = at; p !== -1; p = before.get(p)!) path.unshift(p)
        return path
      }
      queue.push(next)
    }
  }
  return undefined
}

/** A walk in a URL parameter: its stops' paths, each percent-encoded, joined by commas. */
export const encodeWalk = (urls: string[]) => urls.map(encodeURIComponent).join(",")
export const decodeWalk = (param: string) => param.split(",").filter(Boolean).map(decodeURIComponent)

/** Text for matching: lower case, without accents, so "luhmann" finds "Lühmann" and "viet" finds "Việt". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase()

/** Notes whose title or alias holds the query, titles that start with it first. */
export function matchNotes(index: GraphIndex, query: string, except: string, limit = 8): number[] {
  const q = fold(query.trim())
  if (!q) return []
  const hits: { i: number; rank: number }[] = []
  index.notes.forEach((n, i) => {
    if (samePath(n.u, except)) return
    const title = fold(n.t)
    const rank = title.startsWith(q) ? 0 : title.includes(q) ? 1 : n.a.some((a) => fold(a).includes(q)) ? 2 : -1
    if (rank >= 0) hits.push({ i, rank })
  })
  return hits
    .sort((a, b) => a.rank - b.rank || index.notes[a.i].t.localeCompare(index.notes[b.i].t))
    .slice(0, limit)
    .map((h) => h.i)
}

function active(): string[] | undefined {
  try {
    const saved = sessionStorage.getItem(KEY)
    return saved ? JSON.parse(saved) : undefined
  } catch {
    return undefined
  }
}

function remember(urls: string[] | undefined) {
  try {
    if (urls) sessionStorage.setItem(KEY, JSON.stringify(urls))
    else sessionStorage.removeItem(KEY)
  } catch {
    // storage blocked: the walk lasts while the address carries it
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

/** The bar on top of a stop and the previous/next links under it, like a trail's. */
function render(article: HTMLElement, urls: string[], titles: Map<string, string>, s: DOMStringMap) {
  article.querySelectorAll("[data-walk]").forEach((e) => e.remove())
  const here = urls.findIndex((u) => samePath(u, location.pathname))
  if (here < 0) return
  const title = (u: string) => titles.get(u) ?? decodeURIComponent(u.split("/").pop() ?? u)
  const bar = el("aside", "trail-bar walk-bar")
  bar.dataset.walk = ""
  bar.setAttribute("aria-label", s.walkLabel!)
  const where = el("p", "trail-where")
  where.append(
    el("span", "trail-label", `🥾 ${s.walkLabel}`),
    " ",
    `${title(urls[0])} → ${title(urls.at(-1)!)}`,
    " ",
    el("span", "trail-step", `${here + 1} / ${urls.length}`),
  )
  const share = el("button", "trail-leave", s.walkShare)
  share.type = "button"
  share.addEventListener("click", async () => {
    const link = `${location.origin}${location.pathname}?${PARAM}=${encodeWalk(urls)}`
    try {
      await navigator.clipboard.writeText(link)
      share.textContent = document.body.dataset.copied ?? "Copied"
    } catch {
      history.replaceState(history.state, "", link)
    }
  })
  const leave = el("button", "trail-leave", s.walkLeave)
  leave.type = "button"
  leave.addEventListener("click", () => (remember(undefined), article.querySelectorAll("[data-walk]").forEach((e) => e.remove())))
  where.append(share, leave)
  const dots = el("ol", "trail-dots")
  dots.setAttribute("aria-hidden", "true")
  urls.forEach((_, i) => dots.append(el("li", i < here ? "done" : i === here ? "here" : undefined)))
  bar.append(where, dots)
  article.querySelector(".note-head")?.after(bar)

  const nav = el("nav", "series-nav trail-nav walk-nav")
  nav.dataset.walk = ""
  nav.setAttribute("aria-label", s.walkLabel!)
  const link = (u: string, label: string, cls: string, attr: string) => {
    const a = el("a", `internal ${cls}`)
    a.href = u
    a.setAttribute(attr, "")
    a.append(el("small", undefined, label), title(u))
    return a
  }
  nav.append(here > 0 ? link(urls[here - 1], `← ${s.trailPrev}`, "series-prev", "data-trail-prev") : el("span"))
  if (here < urls.length - 1) nav.append(link(urls[here + 1], `${s.trailNext} →`, "series-next", "data-trail-next"))
  else {
    const end = el("span", "series-next walk-end")
    end.append(el("small", undefined, `${s.walkEnd} ✓`), title(urls[here]))
    nav.append(end)
  }
  article.querySelector(".prose")?.after(nav)
}

/** The picker: type a note's name, pick it, walk there. */
function openPicker(index: GraphIndex, s: DOMStringMap) {
  const from = index.notes.findIndex((n) => samePath(n.u, location.pathname))
  if (from < 0) return
  const dialog = el("dialog", "practice walk-picker")
  const close = el("button", "practice-close", "×")
  close.type = "button"
  close.setAttribute("aria-label", s.close ?? "Close")
  close.addEventListener("click", () => dialog.close())
  const label = el("label", "walk-label", s.walkPick)
  const input = el("input")
  input.type = "search"
  input.autocomplete = "off"
  label.append(input)
  const list = el("ul", "walk-results")
  const status = el("p", "walk-status")
  status.setAttribute("aria-live", "polite")
  dialog.append(close, label, list, status)
  dialog.addEventListener("close", () => dialog.remove())
  const go = (to: number) => {
    const path = shortestPath(index.links, index.notes.length, from, to)
    if (!path || path.length < 2) return void (status.textContent = s.walkNone ?? "")
    const urls = path.map((i) => index.notes[i].u)
    remember(urls)
    dialog.close()
    void navigate(urls[1])
  }
  input.addEventListener("input", () => {
    status.textContent = ""
    list.replaceChildren(
      ...matchNotes(index, input.value, location.pathname).map((i) => {
        const li = el("li")
        const b = el("button", undefined, index.notes[i].t)
        b.type = "button"
        b.addEventListener("click", () => go(i))
        li.append(b)
        return li
      }),
    )
  })
  document.body.append(dialog)
  dialog.showModal()
  input.focus()
}

let bound = false
export async function setupWalk(): Promise<void> {
  const article = document.querySelector<HTMLElement>("article.note")
  const button = document.querySelector<HTMLButtonElement>("[data-walk-open]")
  const lang = document.documentElement.dataset.lang
  if (!article || !lang) return
  const url = new URL(location.href)
  const shared = url.searchParams.get(PARAM)
  if (shared) {
    remember(decodeWalk(shared))
    url.searchParams.delete(PARAM)
    history.replaceState(history.state, "", url)
  }
  const s = (button ?? article).dataset
  const walk = active()
  if (!button && !walk) return
  const index = await loadGraph(lang)
  if (button) button.hidden = false
  if (walk) render(article, walk, new Map(index.notes.map((n) => [n.u, n.t])), s)
  if (!bound) {
    bound = true
    document.addEventListener("click", (e) => {
      const open = (e.target as Element).closest<HTMLElement>("[data-walk-open]")
      if (open) void loadGraph(document.documentElement.dataset.lang!).then((i) => openPicker(i, open.dataset))
    })
  }
}
