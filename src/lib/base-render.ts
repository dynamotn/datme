import type { Lang } from "../site.config"
import { getVault, type Doc } from "./vault"
import { t } from "./i18n"
import { escapeAttr } from "./obsidian"
import { engineFor, html } from "./dataview-render"
import { parseBase, runView, BaseError, type BaseFile } from "./bases"
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

/** HTML of one view of a base (the first when no name is given). */
export function renderBaseView(doc: Doc, viewName: string | undefined, lang: Lang): string {
  const s = t(lang)
  try {
    const base = baseOf(doc)
    const view = base.views.find((v) => v.name === viewName) ?? base.views[0]
    const res = runView(base, view, engineFor(lang))
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
  } catch (e) {
    if (e instanceof BaseError || e instanceof DataviewError) {
      return `<p class="dataview dv-error">${escapeAttr(doc.name)}: ${escapeAttr(e.message)}</p>`
    }
    throw e
  }
}
