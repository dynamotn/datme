import path from "node:path"
import { site, type Lang } from "../site.config"
import { t } from "./i18n"
import type { LinkProblem } from "./obsidian"
import { linkPlaces, propertyPlace, type Place } from "./positions"
import { findInGarden } from "./neighbours"
import { privateLinkText, showsName } from "./privacy"
import type { Problem, PrivateLinkUse, SourceNote } from "./vault-types"

export const MD_EXT = /\.md$/i

/**
 * A name as the lookups of links compare it: lowercase and in composed Unicode
 * (NFC), since macOS may write file names decomposed (NFD) while links are typed composed.
 */
export const fold = (s: string) => s.normalize("NFC").toLowerCase()

export function toArray(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v)) return v.filter((x) => x != null).map(String)
  if (typeof v === "string")
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  return [String(v)]
}

/** A link target with %20 and the like decoded; a lone % as in "50% rule" is taken as written. */
function decodeTarget(target: string): string {
  try {
    return decodeURI(target)
  } catch {
    return target
  }
}

/** The places of a problem, or one problem without a place. */
export const orNone = (places: Place[]) => (places.length ? places : [undefined])

export type Report = (level: Problem["level"], file: string, message: string, place?: Place) => void

/** What the link resolver reads: the vault's files, its published notes and how problems are reported. */
export interface LinkInput {
  found: { md: string[]; files: string[] }
  sources: Map<string, SourceNote>
  home?: SourceNote
  /** Where a symlinked home note points, vault-relative without .md. */
  homeTarget?: string
  report: Report
  /** A note's file as written, to tell where its problems are. */
  readSource: (abs: string) => string
}

export type Links = ReturnType<typeof linkResolver>

/**
 * Resolves the links of published notes as Obsidian does: to notes by path,
 * name or alias, to assets and drawings by the shortest path; and tells a link
 * to a private note from a broken one. Aliases two notes share are reported.
 */
export function linkResolver({ found, sources, home, homeTarget, report, readSource }: LinkInput) {
  // Index every asset by path and by basename, for Obsidian's shortest-path lookup.
  const assetByPath = new Map<string, string>()
  const assetByName = new Map<string, string[]>()
  for (const rel of found.files) {
    assetByPath.set(fold(rel), rel)
    const name = fold(path.posix.basename(rel))
    assetByName.set(name, [...(assetByName.get(name) ?? []), rel])
  }

  // Excalidraw sources, published or not: an embed is what makes a drawing public.
  // A drawing's own `publish: false` only keeps it from being a note (with `publish: all`); `ignore` keeps it home.
  const drawingByPath = new Map<string, string>()
  const drawingByName = new Map<string, string[]>()
  for (const rel of [...found.md, ...found.files].filter((f) => /\.excalidraw(\.md)?$/i.test(f))) {
    const lower = fold(rel)
    drawingByPath.set(lower, rel)
    drawingByPath.set(lower.replace(/\.md$/, ""), rel)
    const name = path.posix.basename(lower).replace(/\.md$/, "")
    drawingByName.set(name, [...(drawingByName.get(name) ?? []), rel])
  }

  // Every note of the vault, published or not, to tell a private link target from a missing one.
  const anyNote = new Set<string>()
  for (const rel of found.md) {
    const key = fold(rel.replace(MD_EXT, ""))
    anyNote.add(key)
    anyNote.add(path.posix.basename(key))
  }

  const byPath = new Map<string, SourceNote>()
  const byStem = new Map<string, SourceNote[]>()
  const byAlias = new Map<string, SourceNote>()
  for (const s of sources.values()) {
    byPath.set(fold(s.key), s)
    const stem = fold(s.stem)
    byStem.set(stem, [...(byStem.get(stem) ?? []), s])
  }
  for (const s of sources.values()) {
    for (const a of toArray(s.fm.aliases ?? s.fm.alias)) {
      const lower = fold(a)
      const other = byAlias.get(lower) ?? byStem.get(lower)?.find((o) => o !== s)
      if (other && other !== s) {
        const place = propertyPlace(readSource(s.file), [s.fm.aliases != null ? "aliases" : "alias"], a)
        report("warning", s.key + ".md", `alias "${a}" is also the name or an alias of ${other.key}.md, so links to it are ambiguous`, place)
      }
      byAlias.set(lower, s)
    }
  }
  if (home && homeTarget && homeTarget !== home.key) {
    const stem = fold(path.posix.basename(homeTarget))
    byStem.set(stem, [home, ...(byStem.get(stem) ?? [])])
  }

  // Notes of a folder link the same targets, and a reused note asks its links again: each answer is worked out once.
  const resolved = new Map<string, SourceNote | undefined>()
  function resolveNote(target: string, fromDir: string): SourceNote | undefined {
    const id = `${fromDir}\0${target}`
    if (resolved.has(id)) return resolved.get(id)
    const hit = findNote(target, fromDir)
    resolved.set(id, hit)
    return hit
  }

  function findNote(target: string, fromDir: string): SourceNote | undefined {
    const t = target.trim().replace(MD_EXT, "").replace(/^\/+/, "")
    if (!t) return undefined
    const lower = fold(t)
    const relative = fold(path.posix.normalize(path.posix.join(fromDir, t)))
    const hit = byPath.get(relative) ?? byPath.get(lower)
    if (hit) return hit
    if (!lower.includes("/")) {
      const cands = byStem.get(lower)
      if (cands?.length) return [...cands].sort((a, b) => a.key.length - b.key.length)[0]
    } else {
      // A partial path such as folder/Note: only notes of that name can end with it.
      const hit = byStem.get(path.posix.basename(lower))?.find((s) => fold(s.key).endsWith("/" + lower))
      if (hit) return hit
    }
    return byAlias.get(lower)
  }

  function resolveDrawing(target: string, fromDir: string): string | undefined {
    const t = fold(decodeTarget(target.trim()).replace(/^\/+/, ""))
    const relative = fold(path.posix.normalize(path.posix.join(fromDir, t)))
    const hit = drawingByPath.get(relative) ?? drawingByPath.get(t)
    if (hit) return hit
    const cands = drawingByName.get(path.posix.basename(t).replace(/\.md$/, ""))
    return cands?.length ? [...cands].sort((a, b) => a.length - b.length)[0] : undefined
  }

  function resolveAsset(target: string, fromDir: string): string | undefined {
    const t = decodeTarget(target.trim()).replace(/^\/+/, "")
    const relative = fold(path.posix.normalize(path.posix.join(fromDir, t)))
    const hit = assetByPath.get(relative) ?? assetByPath.get(fold(t))
    if (hit) return hit
    const cands = assetByName.get(fold(path.posix.basename(t)))
    return cands?.length ? [...cands].sort((a, b) => a.length - b.length)[0] : undefined
  }

  /** Whether a link target names a note of the vault that is not published. */
  function isPrivateNote(target: string, fromDir: string): boolean {
    const t = target.trim().replace(/^\/+/, "")
    if (!t || (/\.\w+$/.test(t) && !MD_EXT.test(t))) return false
    const name = fold(t.replace(MD_EXT, ""))
    return anyNote.has(name) || anyNote.has(fold(path.posix.normalize(path.posix.join(fromDir, name))))
  }

  function privateLink(target: string, fromDir: string, alias: string | undefined, lang: Lang): string | undefined {
    if (resolveNote(target, fromDir) || !isPrivateNote(target, fromDir)) return undefined
    return privateLinkText(site.privateLinks, target, alias, t(lang).privateNote)
  }

  /** A note of a neighbour garden; its home page while its index is unknown, e.g. offline on a first build. */
  function gardenLink(name: string, target: string, lang: Lang) {
    const url = site.neighbours[name]
    if (!url) return undefined
    const found = findInGarden(name, target, lang)
    return found === undefined ? { home: url + "/" } : found
  }

  // The same broken link shows up once per language; report it once.
  const seenProblems = new Set<string>()
  const privateLinks: PrivateLinkUse[] = []
  function linkProblem(file: string, p: LinkProblem): void {
    const id = `${file}\0${p.kind}\0${p.target}`
    if (seenProblems.has(id)) return
    seenProblems.add(id)
    const t = p.target.trim().replace(/^\/+/, "")
    const isNote = !/\.\w+$/.test(t) || MD_EXT.test(t)
    // Each time the note writes the link is a problem of its own; a drawing's links have no place in a note.
    const source = sources.get(file.replace(MD_EXT, ""))
    const places = source ? linkPlaces(readSource(source.file), p.kind, t) : []
    const reportEach = (level: Problem["level"], message: string) => {
      for (const place of orNone(places)) report(level, file, message, place)
    }
    if (p.kind === "garden") {
      const [name, note] = [t.slice(0, t.indexOf(":")), t.slice(t.indexOf(":") + 1)]
      reportEach("warning", `link to "${note}" not found in the garden "${name}" (${site.neighbours[name]})`)
    } else if (p.kind === "drawing") {
      reportEach("warning", `drawing "${t}" is not in the vault, so it is not shown`)
    } else if (isNote && isPrivateNote(t, path.posix.dirname(file))) {
      const shown = p.shown ?? t
      privateLinks.push({ file, target: t, shown })
      reportEach(
        "info",
        !shown
          ? `${p.kind} to unpublished note "${t}" is left out`
          : showsName(t, shown)
            ? `${p.kind} to unpublished note "${t}" shows its name as plain text; privateLinks: placeholder or hide keeps it off the site`
            : `${p.kind} to unpublished note "${t}" is shown as plain text`,
      )
    } else if (isNote) {
      reportEach("error", `${p.kind} to missing note "${t}"`)
    } else {
      reportEach("error", `${p.kind} to missing file "${t}"`)
    }
  }

  return { resolveNote, resolveAsset, resolveDrawing, privateLink, gardenLink, linkProblem, privateLinks }
}
