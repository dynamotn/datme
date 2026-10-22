/**
 * Reader highlights: a reader marks passages of a note, adds words of their
 * own, and takes them all home as Markdown for their own vault. Everything
 * stays in their browser. A highlight remembers its words and a little of
 * the text around them, so it finds its place again after the author edits
 * the note; one that no longer fits anywhere is kept, and said to be lost.
 */
import { textFragment } from "./share"

const KEY = "datme:highlights:"
/** Characters of context kept on each side, to tell repeated words apart. */
const CONTEXT = 32

export interface Highlight {
  id: string
  text: string
  prefix: string
  suffix: string
  /** The reader's own words about it. */
  note: string
  /** When it was made, in ms. */
  at: number
}

export interface PageHighlights {
  /** Title of the note, for the export. */
  title: string
  items: Highlight[]
}

/** Characters two strings share at their end. */
function sharedEnd(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

function sharedStart(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/**
 * Where a highlight's words are in the note's text now: of every place they
 * appear, the one whose surroundings match best. -1 when they are gone.
 */
export function locate(text: string, h: Pick<Highlight, "text" | "prefix" | "suffix">): number {
  if (!h.text) return -1
  let best = -1
  let bestScore = -1
  for (let at = text.indexOf(h.text); at >= 0; at = text.indexOf(h.text, at + 1)) {
    const score =
      sharedEnd(text.slice(Math.max(0, at - CONTEXT), at), h.prefix) + sharedStart(text.slice(at + h.text.length, at + h.text.length + CONTEXT), h.suffix)
    if (score > bestScore) (best = at), (bestScore = score)
  }
  return best
}

/** A new highlight of the words at [start, end) of the note's text. */
export function makeHighlight(text: string, start: number, end: number, now: number): Highlight {
  return {
    id: now.toString(36) + Math.random().toString(36).slice(2, 6),
    text: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
    note: "",
    at: now,
  }
}

/** Every highlighted page as Markdown: a section per note, each passage quoted, the reader's words under it, a link back. */
export function toMarkdown(
  pages: { url: string; page: PageHighlights }[],
  heading: string,
  lostLabel: string,
  found?: (url: string, h: Highlight) => boolean,
): string {
  const out = [`# ${heading}`, ""]
  for (const { url, page } of pages) {
    if (!page.items.length) continue
    out.push(`## [${page.title}](${url})`, "")
    for (const h of [...page.items].sort((a, b) => a.at - b.at)) {
      out.push(...h.text.split("\n").map((l) => `> ${l}`))
      out.push(">", `> [↗](${url}${textFragment(h.text)})${found && !found(url, h) ? ` (${lostLabel})` : ""}`, "")
      if (h.note.trim()) out.push(h.note.trim(), "")
    }
  }
  return out.join("\n").trimEnd() + "\n"
}

const pathKey = (path: string) => {
  try {
    path = decodeURI(path)
  } catch {
    // keep it raw
  }
  return path.replace(/\/+$/, "") || "/"
}

export function loadPage(path: string): PageHighlights | undefined {
  try {
    const raw = localStorage.getItem(KEY + pathKey(path))
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

function savePage(path: string, page: PageHighlights) {
  try {
    if (page.items.length) localStorage.setItem(KEY + pathKey(path), JSON.stringify(page))
    else localStorage.removeItem(KEY + pathKey(path))
  } catch {
    // private mode: highlights last for this visit only
  }
}

/** Every page with highlights, by path. */
export function allPages(): { path: string; page: PageHighlights }[] {
  const out: { path: string; page: PageHighlights }[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(KEY)) continue
      try {
        out.push({ path: k.slice(KEY.length), page: JSON.parse(localStorage.getItem(k)!) })
      } catch {
        // a broken entry is skipped
      }
    }
  } catch {
    // no storage
  }
  return out.sort((a, b) => a.page.title.localeCompare(b.page.title))
}

/** Text nodes of the note, and the offset of each in its text. */
function textNodes(prose: Element): { node: Text; start: number }[] {
  const out: { node: Text; start: number }[] = []
  const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT)
  let at = 0
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    out.push({ node: n as Text, start: at })
    at += (n as Text).data.length
  }
  return out
}

/** Wrap the words at [start, end) of the note in marks, one per text node they cross. */
function paint(prose: Element, start: number, end: number, id: string, title: string) {
  for (const { node, start: s } of textNodes(prose)) {
    const e = s + node.data.length
    if (e <= start || s >= end) continue
    let target = node
    if (start > s) target = target.splitText(start - s)
    if (end < e) target.splitText(end - Math.max(start, s))
    const mark = document.createElement("mark")
    mark.className = "reader-highlight"
    mark.dataset.highlight = id
    mark.title = title
    target.replaceWith(mark)
    mark.append(target)
  }
}

function unpaint(prose: Element) {
  prose.querySelectorAll<HTMLElement>("mark.reader-highlight").forEach((m) => m.replaceWith(...m.childNodes))
  prose.normalize()
}

/** Paint a page's highlights; the ones whose words are gone are returned. */
function paintAll(prose: Element, page: PageHighlights | undefined): Set<string> {
  unpaint(prose)
  const lost = new Set<string>()
  for (const h of page?.items ?? []) {
    const at = locate(prose.textContent ?? "", h)
    if (at < 0) lost.add(h.id)
    else paint(prose, at, at + h.text.length, h.id, h.note)
  }
  return lost
}

const labels = () => document.body.dataset

/** The words selected in the note, as offsets in its text, or undefined. */
export function selectionIn(prose: Element): { start: number; end: number } | undefined {
  const sel = document.getSelection()
  if (!sel?.rangeCount || sel.isCollapsed) return undefined
  const range = sel.getRangeAt(0)
  if (!prose.contains(range.commonAncestorContainer)) return undefined
  const before = document.createRange()
  before.setStart(prose, 0)
  before.setEnd(range.startContainer, range.startOffset)
  const start = before.toString().length
  const end = start + range.toString().length
  return end > start ? { start, end } : undefined
}

/** Highlight the selected words of the note on show. */
export function highlightSelection(): boolean {
  const prose = document.querySelector("article.note .prose")
  const where = prose && selectionIn(prose)
  if (!prose || !where) return false
  const path = location.pathname
  const page = loadPage(path) ?? { title: document.querySelector<HTMLElement>(".stack-col")?.dataset.title ?? document.title, items: [] }
  const text = prose.textContent ?? ""
  page.items.push(makeHighlight(text, where.start, where.end, Date.now()))
  savePage(path, page)
  paintAll(prose, page)
  document.getSelection()?.removeAllRanges()
  return true
}

/** Edit the reader's words about a highlight, or remove it. */
function editHighlight(prose: Element, id: string) {
  const path = location.pathname
  const page = loadPage(path)
  const h = page?.items.find((x) => x.id === id)
  if (!page || !h) return
  const s = labels()
  const dialog = document.createElement("dialog")
  dialog.className = "practice highlight-edit"
  const quote = document.createElement("blockquote")
  quote.textContent = h.text
  const label = document.createElement("label")
  label.textContent = s.highlightNote ?? "Your note"
  const area = document.createElement("textarea")
  area.value = h.note
  area.rows = 4
  label.append(area)
  const actions = document.createElement("div")
  actions.className = "practice-actions"
  const button = (text: string, cls: string, on: () => void) => {
    const b = document.createElement("button")
    b.type = "button"
    b.className = cls
    b.textContent = text
    b.addEventListener("click", on)
    return b
  }
  actions.append(
    button(s.highlightRemove ?? "Remove", "practice-again", () => {
      page.items = page.items.filter((x) => x.id !== id)
      savePage(path, page)
      paintAll(prose, page)
      dialog.close()
    }),
    button(s.highlightSave ?? "Save", "practice-good", () => {
      h.note = area.value
      savePage(path, page)
      paintAll(prose, page)
      dialog.close()
    }),
  )
  dialog.append(quote, label, actions)
  dialog.addEventListener("close", () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()
  area.focus()
}

/** Every highlight of the reader, page by page, with an export to Markdown. */
export function openHighlights(): void {
  const s = labels()
  const pages = allPages()
  const prose = document.querySelector("article.note .prose")
  const lostHere = prose ? paintAll(prose, loadPage(location.pathname)) : new Set<string>()
  const dialog = document.createElement("dialog")
  dialog.className = "practice highlights-list"
  const close = document.createElement("button")
  close.type = "button"
  close.className = "practice-close"
  close.textContent = "×"
  close.setAttribute("aria-label", s.close ?? "Close")
  close.addEventListener("click", () => dialog.close())
  const h = document.createElement("h2")
  h.textContent = s.highlights ?? "My highlights"
  dialog.append(close, h)
  if (!pages.length) {
    const p = document.createElement("p")
    p.textContent = s.highlightsEmpty ?? ""
    dialog.append(p)
  }
  for (const { path, page } of pages) {
    const section = document.createElement("section")
    const a = document.createElement("a")
    a.href = path
    a.className = "internal"
    a.textContent = page.title
    const list = document.createElement("ul")
    for (const item of page.items) {
      const li = document.createElement("li")
      const q = document.createElement("q")
      q.textContent = item.text
      li.append(q)
      if (item.note) li.append(" — ", item.note)
      if (samePathKey(path, location.pathname) && lostHere.has(item.id)) {
        const lost = document.createElement("small")
        lost.textContent = ` (${s.highlightLost})`
        li.append(lost)
      }
      list.append(li)
    }
    section.append(a, list)
    dialog.append(section)
  }
  if (pages.length) {
    const actions = document.createElement("div")
    actions.className = "practice-actions"
    const md = () =>
      toMarkdown(
        pages.map(({ path, page }) => ({ url: location.origin + encodeURI(path), page })),
        `${s.highlights} · ${document.querySelector(".brand-name")?.textContent ?? location.host}`,
        s.highlightLost ?? "",
      )
    const copy = document.createElement("button")
    copy.type = "button"
    copy.className = "practice-again"
    copy.textContent = s.copy ?? "Copy"
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(md())
        copy.textContent = s.copied ?? "Copied"
      } catch {
        // no clipboard: the download still works
      }
    })
    const save = document.createElement("button")
    save.type = "button"
    save.className = "practice-good"
    save.textContent = s.highlightsExport ?? "Export as Markdown"
    save.addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([md()], { type: "text/markdown" }))
      const a = document.createElement("a")
      a.href = url
      a.download = "highlights.md"
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
    actions.append(copy, save)
    dialog.append(actions)
  }
  dialog.addEventListener("close", () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()
}

const samePathKey = (a: string, b: string) => pathKey(a) === pathKey(b)

let bound = false
export function setupHighlights(): void {
  const prose = document.querySelector("article.note .prose")
  if (prose) paintAll(prose, loadPage(location.pathname))
  if (bound) return
  bound = true
  document.addEventListener("click", (e) => {
    const target = e.target as Element
    const mark = target.closest?.<HTMLElement>("mark.reader-highlight")
    const here = document.querySelector("article.note .prose")
    if (mark && here && !document.getSelection()?.toString()) editHighlight(here, mark.dataset.highlight!)
    else if (target.closest?.("[data-open-highlights]")) openHighlights()
  })
}
