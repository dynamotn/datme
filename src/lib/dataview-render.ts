import type { Lang } from "../site.config"
import { getVault, type Note } from "./vault"
import { formatDate, t } from "./i18n"
import { escapeAttr } from "./obsidian"
import { parseQuery, runQuery, DataviewError, Unsupported, type Engine, type Page, type Value } from "./dataview"

const engines = new Map<string, Engine>()

/** The published, unprotected notes of a language, as Dataview pages. */
function engineFor(lang: Lang): Engine {
  const vault = getVault()
  const id = `${vault.version}:${lang}`
  let engine = engines.get(id)
  if (!engine) {
    const notes = vault.notes[lang].filter((n) => !n.protected)
    const back = vault.backlinks[lang]
    const pages: Page[] = notes.map((n: Note) => ({
      key: n.key,
      title: n.title,
      url: n.url,
      dir: n.dir,
      stem: n.source.stem,
      tags: n.tags,
      explicitTags: n.tags,
      created: n.created,
      updated: n.updated,
      fields: n.source.fm,
      outlinks: [...new Set(n.links.map((l) => l.key))],
      inlinks: (back.get(n.key) ?? []).filter((b) => !b.note.protected).map((b) => b.note.key),
    }))
    const byKey = new Map(pages.map((p) => [p.key, p]))
    engine = {
      pages,
      resolve: (target) => {
        const s = vault.resolveNote(target, "")
        return s ? byKey.get(s.key) : undefined
      },
    }
    engines.set(id, engine)
  }
  return engine
}

function html(v: Value, lang: Lang): string {
  if (v == null) return '<span class="dv-null">–</span>'
  if (v instanceof Date) return formatDate(v, lang)
  if (Array.isArray(v)) return v.map((x) => html(x, lang)).join(", ")
  if (typeof v === "object") {
    if ((v as { kind?: string }).kind === "link") {
      const l = v as { key?: string; title: string; url?: string }
      return l.url
        ? `<a href="${escapeAttr(l.url)}" class="internal" data-key="${escapeAttr(l.key ?? "")}">${escapeAttr(l.title)}</a>`
        : `<span class="broken-link">${escapeAttr(l.title)}</span>`
    }
    return Object.entries(v)
      .map(([k, x]) => `${escapeAttr(k)}: ${html(x, lang)}`)
      .join("; ")
  }
  if (typeof v === "boolean") return v ? "✓" : "✗"
  return escapeAttr(String(v))
}

/** HTML for a ```dataview block, rendered in the context of `current`. */
export function renderDataview(source: string, lang: Lang, currentKey: string): string {
  const s = t(lang)
  // An empty block shows nothing in Obsidian either.
  if (!source.trim()) return ""
  try {
    const engine = engineFor(lang)
    const res = runQuery(parseQuery(source), { ...engine, current: engine.pages.find((p) => p.key === currentKey) })
    if (!res.rows.length) return `<p class="dataview dv-empty">${escapeAttr(s.dvEmpty)}</p>`
    if (res.type === "list") {
      const items = res.rows.map((r) => `<li>${r.map((v) => html(v, lang)).join(": ")}</li>`).join("")
      return `<ul class="dataview dv-list">${items}</ul>`
    }
    const head = res.headers.map((h) => `<th>${escapeAttr(h === "File" ? s.dvFile : h)}</th>`).join("")
    const body = res.rows.map((r) => `<tr>${r.map((v) => `<td>${html(v, lang)}</td>`).join("")}</tr>`).join("")
    return `<table class="dataview dv-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  } catch (e) {
    if (e instanceof Unsupported) return `<p class="dataview dv-note">⚙️ ${escapeAttr(s.dvUnsupported)} (${escapeAttr(e.message)})</p>`
    if (e instanceof DataviewError) return `<p class="dataview dv-error">Dataview: ${escapeAttr(e.message)}</p>`
    throw e
  }
}

/** DataviewJS runs arbitrary code in Obsidian; the published page only says so. */
export function renderDataviewJs(lang: Lang): string {
  return `<p class="dataview dv-note">⚙️ ${escapeAttr(t(lang).dvUnsupported)} (DataviewJS)</p>`
}
