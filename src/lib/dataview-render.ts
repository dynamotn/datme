import type { Lang } from "../site.config"
import { getVault, type Note } from "./vault"
import { formatDate, t } from "./i18n"
import { escapeAttr } from "./obsidian"
import { parseQuery, runQuery, extractTasks, DataviewError, Unsupported, type Engine, type Page, type Value } from "./dataview"
import { parseTasksQuery, runTasksQuery, groupOf, TasksQueryError, type TaskItem } from "./tasks-query"
import { parseSearch, search, highlight, SearchQueryError, type Searchable } from "./search-query"
import { listed } from "./vault"

const engines = new Map<string, Engine>()

/** The published, unprotected notes of a language, as Dataview pages. */
export function engineFor(lang: Lang): Engine {
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
      tasks: extractTasks(n.md),
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

export function html(v: Value, lang: Lang): string {
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

/**
 * A ```dataview block, rendered in the context of `current`: HTML, or for
 * TASK queries markdown, so the text of each task renders like the note it
 * comes from.
 */
export function renderDataview(source: string, lang: Lang, currentKey: string): string | { markdown: string } {
  const s = t(lang)
  // An empty block shows nothing in Obsidian either.
  if (!source.trim()) return ""
  try {
    const engine = engineFor(lang)
    const res = runQuery(parseQuery(source), { ...engine, current: engine.pages.find((p) => p.key === currentKey) })
    if (res.type === "task") {
      if (!res.groups?.length) return `<p class="dataview dv-empty">${escapeAttr(s.dvEmpty)}</p>`
      // Blank lines around the HTML let the task lists in between parse as markdown.
      const parts = res.groups.map(
        (g) => `<p class="dv-task-group">${html(g.key, lang)}</p>\n\n${g.tasks.map((t) => `- [${t.checked ? "x" : " "}] ${t.text}`).join("\n")}`,
      )
      return { markdown: `<div class="dataview dv-tasks">\n\n${parts.join("\n\n")}\n\n</div>` }
    }
    if (!res.rows.length) return `<p class="dataview dv-empty">${escapeAttr(s.dvEmpty)}</p>`
    if (res.nested) {
      const items = res.rows
        .map(([key, members]) => `<li>${html(key, lang)}<ul>${(members as Value[]).map((m) => `<li>${html(m, lang)}</li>`).join("")}</ul></li>`)
        .join("")
      return `<ul class="dataview dv-list dv-groups">${items}</ul>`
    }
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

/**
 * A ```tasks block of the Obsidian Tasks plugin, over the published notes: a
 * task list in markdown, each task followed by a link to its note.
 */
export function renderTasksBlock(source: string, lang: Lang): string | { markdown: string } {
  const s = t(lang)
  try {
    const engine = engineFor(lang)
    const items: (TaskItem & { page: Page })[] = engine.pages.flatMap((page) =>
      (page.tasks ?? []).map((task) => ({ task, path: page.key + ".md", page })),
    )
    const query = parseTasksQuery(source)
    const found = runTasksQuery(query, items) as (TaskItem & { page: Page })[]
    if (!found.length) return `<p class="dataview dv-empty">${escapeAttr(s.dvEmpty)}</p>`
    const line = (i: (typeof found)[number]) =>
      `- [${i.task.status === " " ? " " : "x"}] ${i.task.text} <a class="task-note internal" href="${escapeAttr(i.page.url)}">${escapeAttr(i.page.title)}</a>`
    const groups = new Map<string, typeof found>()
    for (const i of found) {
      const key = query.group ? groupOf(i, query.group) : ""
      groups.set(key, [...(groups.get(key) ?? []), i])
    }
    // Blank lines around the HTML let the task lists in between parse as markdown.
    const parts = [...groups].map(([key, list]) =>
      `${query.group ? `<p class="dv-task-group">${escapeAttr(key)}</p>\n\n` : ""}${list.map(line).join("\n")}`,
    )
    return { markdown: `<div class="dataview dv-tasks tasks-query">\n\n${parts.join("\n\n")}\n\n</div>` }
  } catch (e) {
    if (e instanceof TasksQueryError) return `<p class="dataview dv-error">Tasks: ${escapeAttr(e.message)}</p>`
    throw e
  }
}

/** A ```query block: Obsidian's search over the published notes, with the line that matched. */
export function renderSearchBlock(source: string, lang: Lang): string {
  const s = t(lang)
  try {
    const query = parseSearch(source)
    if (!query) return ""
    const notes = listed(lang).filter((n) => !n.protected)
    const docs: (Searchable & { url: string; key: string })[] = notes.map((n) => ({
      title: n.title,
      path: n.key + ".md",
      tags: n.tags,
      // Links are already HTML here; their text is what a reader sees.
      text: n.md.replace(/<[^>]+>/g, ""),
      url: n.url,
      key: n.key,
    }))
    const hits = search(query, docs)
    if (!hits.length) return `<p class="dataview dv-empty">${escapeAttr(s.dvEmpty)}</p>`
    const items = hits.map((h) => {
      const d = h.doc as (typeof docs)[number]
      const snippet = h.snippet ? `<p class="query-snippet">${highlight(h.snippet.slice(0, 240), h.words)}</p>` : ""
      return `<li><a class="internal" href="${escapeAttr(d.url)}" data-key="${escapeAttr(d.key)}">${escapeAttr(d.title)}</a>${snippet}</li>`
    })
    return `<ul class="dataview query-results">${items.join("")}</ul>`
  } catch (e) {
    if (e instanceof SearchQueryError) return `<p class="dataview dv-error">Query: ${escapeAttr(e.message)}</p>`
    throw e
  }
}

/** DataviewJS runs arbitrary code in Obsidian; the published page only says so. */
export function renderDataviewJs(lang: Lang): string {
  return `<p class="dataview dv-note">⚙️ ${escapeAttr(t(lang).dvUnsupported)} (DataviewJS)</p>`
}
