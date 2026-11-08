import { afterAll, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as childProcess from "node:child_process"
import { loadConfig, site } from "../src/site.config"
import { getVault } from "../src/lib/vault"
import { historyProblems, noteVersions } from "../src/lib/history"

// Vaults of their own, in git (or not), so what history reads and reports is known exactly.
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "datme-history-git-")))
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@x",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@x",
}
const git = (dir: string, ...args: string[]) => {
  const p = Bun.spawnSync(["git", "-C", dir, ...args], { env })
  if (p.exitCode !== 0) throw new Error(p.stderr.toString())
  return p.stdout.toString().trim()
}
const commit = (repo: string, date: string, files: Record<string, string>) => {
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(repo, file), text)
  git(repo, "add", "-A")
  const p = Bun.spawnSync(["git", "-C", repo, "commit", "-qm", "m", "--date", date], { env: { ...env, GIT_COMMITTER_DATE: date } })
  if (p.exitCode !== 0) throw new Error(p.stderr.toString())
}
const note = (text: string) => `---\npublish: true\n---\n${text}`

const saved = { ...site }
const g = globalThis as { __vaultVersion?: number }

/** Point the site at another vault; its versions of "Plant", and what went wrong reading them. */
function read(dir: string) {
  const config = loadConfig(dir, {})
  for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
  Object.assign(site, config)
  g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
  const plant = getVault().byKey["en-US"].get("Plant")!
  return {
    versions: noteVersions(plant).map((v) => v.text),
    problems: historyProblems().map((p) => `${p.level} ${p.file}: ${p.message}`),
  }
}

function repo(name: string): string {
  const dir = path.join(tmp, name)
  fs.mkdirSync(dir)
  git(dir, "init", "-q")
  fs.writeFileSync(path.join(dir, "datme.yaml"), "history: true\nlanguages: [en-US]\n")
  commit(dir, "2026-01-02T10:00:00Z", { "Plant.md": note("Seed.") })
  commit(dir, "2026-03-04T10:00:00Z", {
    "Plant.md": note("Seed, then shoot."),
  })
  return dir
}

afterAll(() => {
  for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
  Object.assign(site, saved)
  g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("note history from git", () => {
  test("a repository gives each version, and no problem", () => {
    expect(read(repo("full"))).toEqual({
      versions: ["Seed.", "Seed, then shoot."],
      problems: [],
    })
  })

  test("a vault outside any repository has no history, and that is no problem", () => {
    const dir = path.join(tmp, "plain")
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, "datme.yaml"), "history: true\nlanguages: [en-US]\n")
    fs.writeFileSync(path.join(dir, "Plant.md"), note("Seed."))
    expect(read(dir)).toEqual({ versions: [], problems: [] })
  })

  test("history off reads nothing and reports nothing", () => {
    read(repo("off"))
    site.history = false
    expect(historyProblems()).toEqual([])
  })

  test("a shallow clone is a warning that says how to fetch the history", () => {
    const clone = path.join(tmp, "clone")
    git(tmp, "clone", "-q", "--depth", "1", `file://${repo("origin")}`, clone)
    expect(read(clone)).toEqual({
      versions: ["Seed, then shoot."],
      problems: ["warning .git: shallow clone: note histories stop at the clone; fetch the whole history (GIT_DEPTH: 0 on GitLab, fetch-depth: 0 on GitHub)"],
    })
  })

  test("a git log that fails is a warning, not an empty history in silence", () => {
    const dir = repo("broken-log")
    const tree = git(dir, "rev-parse", "HEAD^{tree}")
    fs.rmSync(path.join(dir, ".git/objects", tree.slice(0, 2), tree.slice(2)))
    const { versions, problems } = read(dir)
    expect(versions).toEqual([])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toStartWith("warning .git: note histories are empty: git failed (")
  })

  test("a cat-file that fails is a warning, and the notes still show what the log gave", () => {
    const dir = repo("broken-blob")
    const real = childProcess.spawnSync
    const spy = spyOn(childProcess, "spawnSync").mockImplementation(((cmd: string, args: string[], ...rest: unknown[]) =>
      args.includes("cat-file") ? { status: 128, stderr: "fatal: bad object\nmore" } : (real as (...a: unknown[]) => unknown)(cmd, args, ...rest)) as never)
    try {
      expect(read(dir)).toEqual({ versions: [], problems: ["warning .git: some note versions are skipped: git cannot read them (fatal: bad object)"] })
    } finally {
      spy.mockRestore()
    }
  })

  test("a history longer than git's output once could be is read whole", () => {
    const dir = repo("long")
    // One commit adding 4,400 notes deep in a hidden folder, with paths so long that `git log` prints over 64 MB.
    const folder = Array(100).fill("x".repeat(160)).join("/")
    const branch = git(dir, "symbolic-ref", "--short", "HEAD")
    const lines = [
      "blob",
      "mark :1",
      "data 1",
      "x",
      `commit refs/heads/${branch}`,
      "committer t <t@x> 1780000000 +0000",
      "data 1",
      "m",
      `from refs/heads/${branch}^0`,
    ]
    for (let i = 0; i < 4_400; i++) lines.push(`M 100644 :1 .pad/${folder}/${i}.md`)
    const p = Bun.spawnSync(["git", "-C", dir, "fast-import", "--quiet"], { env, stdin: Buffer.from(lines.join("\n") + "\n") })
    if (p.exitCode !== 0) throw new Error(p.stderr.toString())
    expect(Bun.spawnSync(["git", "-C", dir, "log", "--raw", "--no-abbrev", "-z", "-1", "--", "*.md"]).stdout.length).toBeGreaterThan(64 * 1024 * 1024)
    expect(read(dir)).toEqual({
      versions: ["Seed.", "Seed, then shoot."],
      problems: [],
    })
  }, 120_000)
})
