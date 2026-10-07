/**
 * How an idea grew: the published versions of a note, from git, and what
 * changed between them, paragraph by paragraph. Off unless `history: true`.
 *
 * Each version is cleaned exactly as the note is today, so history shows
 * nothing a reader could not have read on that day: versions where the note
 * was private or protected are skipped; frontmatter, comments, locked parts
 * and other languages are taken out; commit messages are never shown.
 */
import { execFileSync } from "node:child_process"
import { site, type Lang } from "../site.config"
import { filterLanguage, getVault, isPublished, parseFrontmatter, type Note } from "./vault"
import { withoutLocked } from "./locked"

export interface Version {
  date: Date
  /** The note as readers saw it then, as markdown. */
  text: string
}

export type Change = { kind: "same" | "add" | "del"; text: string }

const git = (args: string[]) => execFileSync("git", ["-C", site.vault, "-c", "core.quotepath=off", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

/** What a reader saw of a version of a note in a language, or undefined if it was not public then. */
export function publicText(raw: string, lang: Lang): string | undefined {
  const { fm, body } = parseFrontmatter(raw)
  if (!isPublished(fm, site.publish) || (fm.password != null && fm.password !== "")) return undefined
  return withoutLocked(filterLanguage(body, lang))
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Commits of a file, oldest first, following renames: their time and the path it had. */
function commitsOf(rel: string): { hash: string; time: number; path: string }[] {
  // `git show` wants the paths log prints: relative to the repository, which may hold the vault in a folder.
  const log = git(["log", "--follow", "--format=%x00%H %ct", "--name-only", "--", rel])
  const out: { hash: string; time: number; path: string }[] = []
  for (const block of log.split("\0").filter(Boolean)) {
    const [head, ...files] = block.split("\n").filter(Boolean)
    const [hash, time] = head.split(" ")
    if (files[0]) out.push({ hash, time: Number(time) * 1000, path: files[0] })
  }
  return out.reverse()
}

const cache = new Map<string, Version[]>()

/** The public versions of a note, oldest first, a version only when what readers saw changed. */
export function noteVersions(note: Note): Version[] {
  const id = `${getVault().version}:${note.lang}:${note.key}`
  const hit = cache.get(id)
  if (hit) return hit
  const versions: Version[] = []
  try {
    for (const c of commitsOf(note.key + ".md")) {
      let raw: string
      try {
        raw = git(["show", `${c.hash}:${c.path}`])
      } catch {
        continue
      }
      const text = publicText(raw, note.lang)
      if (text == null || text === versions.at(-1)?.text) continue
      versions.push({ date: new Date(c.time), text })
    }
  } catch {
    // not in git
  }
  cache.set(id, versions)
  return versions
}

/** Whether a note gets a history page: the site and the note allow it, and it changed since it was planted. */
export function hasHistory(note: Note): boolean {
  if (!site.history || note.protected || note.source.fm.history === false || note.draft) return false
  return noteVersions(note).length > 1
}

/** Blocks of a note: paragraphs split by blank lines, a code block kept whole. */
function paragraphs(s: string): string[] {
  const out: string[] = []
  let fence: string | undefined
  let cur: string[] = []
  const flush = () => {
    if (cur.join("").trim()) out.push(cur.join("\n").trim())
    cur = []
  }
  for (const line of s.split("\n")) {
    const f = line.match(/^\s*(`{3,}|~{3,})/)
    if (f && (!fence || f[1].startsWith(fence))) fence = fence ? undefined : f[1]
    if (!fence && !f && !line.trim()) flush()
    else cur.push(line)
  }
  flush()
  return out
}

/** Paragraphs kept, added and removed from one version to the next (longest common subsequence). */
export function diffParagraphs(before: string, after: string): Change[] {
  const a = paragraphs(before)
  const b = paragraphs(after)
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  }
  const out: Change[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] })
      i++
      j++
    } else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) out.push({ kind: "add", text: b[j++] })
    else out.push({ kind: "del", text: a[i++] })
  }
  return out
}

/** The URL of a note's history page. */
export const historyUrl = (note: Note) => `${note.url.replace(/\/$/, "")}/history`
