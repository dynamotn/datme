import type { Lang } from "../site.config"
import { getVault, type Doc } from "./vault"
import { t } from "./i18n"
import { escapeAttr } from "./obsidian"
import { engineFor, html } from "./dataview-render"
import { parseBase, runView, BaseError, type BaseFile, type BaseView } from "./bases"
import { DataviewError } from "./dataview"

const parsed = new Map<string, BaseFile>()

function baseOf(doc: Doc): BaseFile {
  const id = `${getVault().version}:${doc.rel}`
  let base = parsed.get(id)
  if (!base) {
    base = parseBase(doc.src)
    parsed.set(id, base)
  }
  return base
}

/** Names of the views of a base, in file order. */
export function baseViews(doc: Doc): string[] {
  try {
    return baseOf(doc).views.map((v) => v.name)
  } catch {
    return []
  }
}

/** HTML of one view of a base (the first when no name is given), with `this` the note at `currentKey`. */
export function renderBaseView(doc: Doc, viewName: string | undefined, lang: Lang, currentKey?: string): string {
  try {
    const base = baseOf(doc)
    return renderView(base, base.views.find((v) => v.name === viewName) ?? base.views[0], lang, currentKey)
  } catch (e) {
    return errorOf(e, doc.name)
  }
}

/**
 * A ```base block: a base written inline in a note, every view in file order,
 * named when there are several. `this` is the note holding the block.
 */
export function renderBaseBlock(source: string, lang: Lang, currentKey: string): string {
  try {
    const base = parseBase(source)
    const named = base.views.length > 1
    return `<div class="base-embed base-block">${base.views
      .map((view) => (named ? `<p class="base-view-name">${escapeAttr(view.name)}</p>` : "") + renderView(base, view, lang, currentKey))
      .join("")}</div>`
  } catch (e) {
    return errorOf(e, "base")
  }
}

function errorOf(e: unknown, name: string): string {
  if (e instanceof BaseError || e instanceof DataviewError) return `<p class="dataview dv-error">${escapeAttr(name)}: ${escapeAttr(e.message)}</p>`
  throw e
}

function renderView(base: BaseFile, view: BaseView, lang: Lang, currentKey?: string): string {
  const s = t(lang)
  const engine = engineFor(lang)
  const res = runView(base, view, { ...engine, current: currentKey ? engine.pages.find((p) => p.key === currentKey) : undefined })
  const notes = getVault().byKey[lang]
  if (!res.rows.length) return `<p class="dataview dv-empty">${escapeAttr(s.dvEmpty)}</p>`
  if (view.type === "cards") {
    const cards = res.rows
      .map(({ page, cells, image }) => {
        const img = typeof image === "string" && /^https?:\/\//.test(image) ? image : notes.get(page.key)?.banner
        const fields = res.columns
          .map((c, i) => (c.id === "file.name" ? "" : `<li><b>${escapeAttr(c.name)}</b> ${html(cells[i], lang)}</li>`))
          .join("")
        return `<article class="index-card base-card">${img ? `<a class="index-card-media" href="${escapeAttr(page.url)}" tabindex="-1"><img src="${escapeAttr(img)}" alt="" loading="lazy"></a>` : ""}<h3 class="index-card-title"><a class="internal" href="${escapeAttr(page.url)}" data-key="${escapeAttr(page.key)}">${escapeAttr(page.title)}</a></h3>${fields ? `<ul class="base-fields">${fields}</ul>` : ""}</article>`
      })
      .join("")
    return `<div class="card-wall base-cards">${cards}</div>`
  }
  if (view.type === "list") {
    return `<ul class="dataview dv-list">${res.rows.map((r) => `<li>${r.cells.map((c) => html(c, lang)).join(" · ")}</li>`).join("")}</ul>`
  }
  const head = res.columns.map((c) => `<th>${escapeAttr(c.name)}</th>`).join("")
  const body = res.rows.map((r) => `<tr>${r.cells.map((c) => `<td>${html(c, lang)}</td>`).join("")}</tr>`).join("")
  return `<table class="dataview base-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}
