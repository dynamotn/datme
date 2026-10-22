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
import {
  contentLanguage,
  fallbackOf,
  filterLanguage,
  getVault,
  isIgnored,
  isPublished,
  parseFrontmatter,
  sourceLangOf,
  type Note,
} from "./vault"
import { publicMarkdown } from "./llms"

export interface Version {
  date: Date
  /** The note as readers saw it then, as markdown. */
  text: string
}

export type Change = { kind: "same" | "add" | "del"; text: string }

const git = (args: string[]) => execFileSync("git", ["-C", site.vault, "-c", "core.quotepath=off", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

/**
 * What a reader saw of a version of a note in a language, or undefined if it was not public by `until`.
 * Given the note, links to notes that are private today show as the page shows them.
 */
export function publicText(raw: string, lang: Lang, until = new Date(), note?: Note): string | undefined {
  const { fm, body } = parseFrontmatter(raw)
  if (!isPublished(fm, site.publish, until) || (fm.password != null && fm.password !== "")) return undefined
  // Each version falls back the way the note does today.
  const shown = contentLanguage(body, lang, fallbackOf(fm, sourceLangOf(fm)))
  return publicMarkdown(filterLanguage(body, shown), note)
}

/** A commit that changed a file: when, the path the file had, and its text then as a blob. */
export interface FileCommit {
  time: number
  path: string
  blob: string
}

/**
 * Every file's commits, newest first, keyed by the path it has today (relative to the repository),
 * from one `git log --raw -z` of the markdown files: each file follows its renames, as
 * `git log --follow` would, so a moved note keeps the versions it had under its old name.
 */
export function parseFileLog(log: string): Map<string, FileCommit[]> {
  const chains = new Map<string, FileCommit[]>()
  // The files whose history goes on at a path, older commits being seen later.
  const following = new Map<string, Set<string>>()
  const followers = (p: string) => {
    let set = following.get(p)
    if (!set) following.set(p, (set = new Set([p])))
    return set
  }
  const record = (p: string, c: FileCommit) => {
    for (const key of followers(p)) {
      let chain = chains.get(key)
      if (!chain) chains.set(key, (chain = []))
      chain.push(c)
    }
  }
  for (const block of log.split("\x01")) {
    const head = block.indexOf("\0")
    if (head < 0) continue
    const [, time] = block.slice(0, head).split(" ")
    const fields = block.slice(head + 1).replace(/^\n/, "").split("\0")
    for (let i = 0; i < fields.length; i++) {
      if (!fields[i].startsWith(":")) continue
      const meta = fields[i].split(" ")
      const blob = meta[3]
      const status = meta[4]
      if (status.startsWith("R")) {
        const [from, to] = [fields[++i], fields[++i]]
        record(to, { time: Number(time) * 1000, path: to, blob })
        // Older commits knew the file by its former name.
        const moved = followers(to)
        following.set(to, new Set())
        for (const key of moved) followers(from).add(key)
        continue
      }
      const p = fields[++i]
      // A deleted file has no text to show at that commit.
      if (status !== "D") record(p, { time: Number(time) * 1000, path: p, blob })
    }
  }
  return chains
}

/** The texts of blobs, from one `git cat-file --batch` output; a missing object has none. */
export function parseBlobs(out: Buffer): Map<string, string> {
  const blobs = new Map<string, string>()
  let at = 0
  while (at < out.length) {
    const eol = out.indexOf(10, at)
    if (eol < 0) break
    const [sha, type, size] = out.subarray(at, eol).toString("utf8").split(" ")
    at = eol + 1
    if (type === "missing" || size == null) continue
    const end = at + Number(size)
    if (type === "blob") blobs.set(sha, out.subarray(at, end).toString("utf8"))
    at = end + 1
  }
  return blobs
}

interface GitHistory {
  key: string
  /** Where the vault sits in the repository, "" at its root. */
  prefix: string
  chains: Map<string, FileCommit[]>
  /** Texts by blob, null for one git could not read. */
  blobs: Map<string, string | null>
}

let walked: GitHistory | undefined

/** The vault's git history, read once per build (and again when the vault changes in dev). */
function gitHistory(): GitHistory {
  const key = `${getVault().version}:${site.vault}`
  if (walked?.key === key) return walked
  let prefix = ""
  let chains = new Map<string, FileCommit[]>()
  try {
    // Paths as log prints them: relative to the repository, which may hold the vault in a folder.
    prefix = git(["rev-parse", "--show-prefix"]).trim()
    chains = parseFileLog(git(["log", "-M", "--format=%x01%H %ct", "--raw", "--no-abbrev", "-z", "--", ":(top)*.md"]))
  } catch {
    // not in git
  }
  walked = { key, prefix, chains, blobs: new Map() }
  // The texts of every note's publishable versions, in one read.
  const vault = getVault()
  const rels = new Set(site.langs.flatMap((lang) => vault.notes[lang].map((n) => n.key + ".md")))
  readBlobs(walked, [...rels].flatMap((rel) => commitsOf(walked!, rel)))
  return walked
}

/** Commits of a file, oldest first, at a path that could have been published. */
function commitsOf(h: GitHistory, rel: string): FileCommit[] {
  return (h.chains.get(h.prefix + rel) ?? []).filter((c) => publishable(h.prefix, c.path)).reverse()
}

/** Reads the texts of commits not read yet, with a single git process. */
function readBlobs(h: GitHistory, commits: FileCommit[]): void {
  const wanted = [...new Set(commits.map((c) => c.blob))].filter((b) => !h.blobs.has(b))
  if (!wanted.length) return
  try {
    const out = execFileSync("git", ["-C", site.vault, "cat-file", "--batch"], { input: wanted.join("\n") + "\n", maxBuffer: 1024 * 1024 * 1024 })
    for (const [sha, text] of parseBlobs(out)) h.blobs.set(sha, text)
  } catch {
    // unreadable: those versions are skipped
  }
  for (const sha of wanted) if (!h.blobs.has(sha)) h.blobs.set(sha, null)
}

/**
 * Whether a version at a path git prints could have been published: not outside the vault,
 * in an ignored folder or in a hidden one like `.trash`, where a note may have been before.
 */
function publishable(prefix: string, repoPath: string): boolean {
  if (!repoPath.startsWith(prefix)) return false
  const rel = repoPath.slice(prefix.length)
  return !!rel && !isIgnored(rel) && !rel.split("/").some((part) => part.startsWith("."))
}

/** Every committed text of a file, oldest first, shared by the languages of a note. */
function rawVersions(rel: string): { time: number; raw: string }[] {
  const h = gitHistory()
  const commits = commitsOf(h, rel)
  // A file the build did not read up front, such as a note found later in dev.
  readBlobs(h, commits)
  return commits.flatMap((c) => {
    const raw = h.blobs.get(c.blob)
    return raw == null ? [] : [{ time: c.time, raw }]
  })
}

const cache = new Map<string, Version[]>()

/** The public versions of a note, oldest first, a version only when what readers saw changed. */
export function noteVersions(note: Note): Version[] {
  const id = `${getVault().version}:${note.lang}:${note.key}`
  const hit = cache.get(id)
  if (hit) return hit
  const versions: Version[] = []
  const all = rawVersions(note.key + ".md")
  for (const [i, v] of all.entries()) {
    // A version scheduled for later was only seen if its day came before the next commit replaced it.
    const text = publicText(v.raw, note.lang, new Date(all[i + 1]?.time ?? Date.now()), note)
    if (text == null || text === versions.at(-1)?.text) continue
    versions.push({ date: new Date(v.time), text })
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
