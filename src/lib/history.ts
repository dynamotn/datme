/**
 * How an idea grew: the published versions of a note, from git, and what
 * changed between them, paragraph by paragraph. Off unless `history: true`.
 *
 * Each version is cleaned exactly as the note is today, so history shows
 * nothing a reader could not have read on that day: versions where the note
 * was private or protected are skipped; frontmatter, comments, locked parts
 * and other languages are taken out; commit messages are never shown.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { site, type Lang } from "../site.config"
import {
  contentLanguage,
  fallbackOf,
  filterLanguage,
  getVault,
  gitLines,
  isIgnored,
  isPublished,
  parseFrontmatter,
  sourceLangOf,
  type Note,
  type Problem,
} from "./vault"
import { publicMarkdown } from "./llms"

export interface Version {
  date: Date
  /** The note as readers saw it then, as markdown. */
  text: string
}

export type Change = { kind: "same" | "add" | "del"; text: string }

// stderr ignored: outside a repository git would print "fatal: not a git repository".
const git = (args: string[]) =>
  execFileSync("git", ["-C", site.vault, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })

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
  const parser = fileLogParser()
  for (const block of log.split("\x01")) parser.add(block)
  return parser.chains
}

/** The same, fed one commit's block at a time, so a log of any length is never held whole. */
function fileLogParser() {
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
  const add = (block: string) => {
    const head = block.indexOf("\0")
    if (head < 0) return
    const [, time] = block.slice(0, head).split(" ")
    const fields = block
      .slice(head + 1)
      .replace(/^\n/, "")
      .split("\0")
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
  return { chains, add }
}

/**
 * The texts of blobs, from a file holding one `git cat-file --batch` output; a missing object has none.
 * Read blob by blob, so the output has no size limit.
 */
export function parseBlobs(fd: number): Map<string, string> {
  const blobs = new Map<string, string>()
  const head = Buffer.alloc(256)
  for (let at = 0; ; ) {
    const n = fs.readSync(fd, head, 0, head.length, at)
    const eol = head.subarray(0, n).indexOf(10)
    if (eol < 0) break
    const [sha, type, size] = head.subarray(0, eol).toString("utf8").split(" ")
    at += eol + 1
    if (type === "missing" || size == null) continue
    const body = Buffer.alloc(Number(size))
    for (let got = 0; got < body.length; ) {
      const m = fs.readSync(fd, body, got, body.length - got, at + got)
      if (m === 0) break
      got += m
    }
    if (type === "blob") blobs.set(sha, body.toString("utf8"))
    at += body.length + 1
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
  /** What went wrong reading git, for `datme check`. */
  problems: Problem[]
}

let walked: GitHistory | undefined

/** The vault's git history, read once per build (and again when the vault changes in dev). */
function gitHistory(): GitHistory {
  const key = `${getVault().version}:${site.vault}`
  if (walked?.key === key) return walked
  let prefix = ""
  let chains = new Map<string, FileCommit[]>()
  const problems: Problem[] = []
  const warn = (message: string) => problems.push({ level: "warning", file: ".git", message })
  let inGit = true
  try {
    // Paths as log prints them: relative to the repository, which may hold the vault in a folder.
    prefix = git(["rev-parse", "--show-prefix"]).trim()
  } catch {
    // not a git repository: no history, as expected
    inGit = false
  }
  if (inGit) {
    try {
      if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true") {
        warn("shallow clone: note histories stop at the clone; fetch the whole history (GIT_DEPTH: 0 on GitLab, fetch-depth: 0 on GitHub)")
      }
      const parser = fileLogParser()
      // A block is the text from one \x01 to the next, which may begin in the middle of a line.
      let block = ""
      gitLines(["log", "-M", "--format=%x01%H %ct", "--raw", "--no-abbrev", "-z", "--", ":(top)*.md"], (line) => {
        const [first, ...starts] = line.split("\x01")
        block += first
        for (const start of starts) {
          parser.add(block)
          block = start
        }
        block += "\n"
      })
      parser.add(block)
      chains = parser.chains
    } catch (e) {
      warn(`note histories are empty: git failed (${(e as Error).message})`)
    }
  }
  walked = { key, prefix, chains, blobs: new Map(), problems }
  // The texts of every note's publishable versions, in one read.
  const vault = getVault()
  const rels = new Set(site.langs.flatMap((lang) => vault.notes[lang].map((n) => n.key + ".md")))
  readBlobs(
    walked,
    [...rels].flatMap((rel) => commitsOf(walked!, rel)),
  )
  return walked
}

/** What went wrong reading the vault's git history, if anything. */
export function historyProblems(): Problem[] {
  return site.history ? gitHistory().problems : []
}

/** Commits of a file, oldest first, at a path that could have been published. */
function commitsOf(h: GitHistory, rel: string): FileCommit[] {
  return (h.chains.get(h.prefix + rel) ?? []).filter((c) => publishable(h.prefix, c.path)).reverse()
}

/** Reads the texts of commits not read yet, with a single git process. */
function readBlobs(h: GitHistory, commits: FileCommit[]): void {
  const wanted = [...new Set(commits.map((c) => c.blob))].filter((b) => !h.blobs.has(b))
  if (!wanted.length) return
  // Asked of git through files, answered the same way: the texts may add up to any size.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-git-"))
  try {
    fs.writeFileSync(path.join(tmp, "in"), wanted.join("\n") + "\n")
    const input = fs.openSync(path.join(tmp, "in"), "r")
    const output = fs.openSync(path.join(tmp, "out"), "w+")
    try {
      const p = spawnSync("git", ["-C", site.vault, "cat-file", "--batch"], {
        stdio: [input, output, "pipe"],
        encoding: "utf8",
      })
      if (p.status !== 0) throw new Error(p.error?.message || p.stderr.trim().split("\n")[0] || `exit code ${p.status}`)
      for (const [sha, text] of parseBlobs(output)) h.blobs.set(sha, text)
    } finally {
      fs.closeSync(input)
      fs.closeSync(output)
    }
  } catch (e) {
    h.problems.push({
      level: "warning",
      file: ".git",
      message: `some note versions are skipped: git cannot read them (${(e as Error).message})`,
    })
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
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
  if (!site.history || note.protected || note.warning || note.source.fm.history === false || note.draft) return false
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
