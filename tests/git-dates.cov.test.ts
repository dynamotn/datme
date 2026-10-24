import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadConfig, site } from "../src/site.config"
import { eachLine, getVault, type Vault } from "../src/lib/vault"

// Vaults of their own, in git (or not), so the dates and what went wrong are known exactly.
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "datme-git-dates-")))
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" }
const git = (dir: string, ...args: string[]) => {
  const p = Bun.spawnSync(["git", "-C", dir, ...args], { env })
  if (p.exitCode !== 0) throw new Error(p.stderr.toString())
  return p.stdout.toString().trim()
}
const commit = (repo: string, date: string, files: Record<string, string>) => {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
    fs.writeFileSync(path.join(repo, file), text)
  }
  git(repo, "add", "-A")
  const p = Bun.spawnSync(["git", "-C", repo, "commit", "-qm", "m", "--date", date], { env: { ...env, GIT_COMMITTER_DATE: date } })
  if (p.exitCode !== 0) throw new Error(p.stderr.toString())
}
const CONFIG = "publish: all\nlanguages: [en-US]\n"

const saved = { ...site }
const g = globalThis as { __vaultVersion?: number }

/** Point the site at another vault and index it afresh. */
function useVault(dir: string): Vault {
  const config = loadConfig(dir, {})
  for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
  Object.assign(site, config)
  g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
  return getVault()
}
const gitProblems = (v: Vault) => v.problems.filter((p) => p.file === ".git").map((p) => `${p.level}: ${p.message}`)
const iso = (d: Date | undefined) => d?.toISOString()

/** A repository holding the vault in a folder, with a note made and changed, and a note whose name git would quote. */
function repo(name: string): string {
  const dir = path.join(tmp, name)
  fs.mkdirSync(dir, { recursive: true })
  git(dir, "init", "-q")
  commit(dir, "2026-01-02T10:00:00Z", {
    "garden/datme.yaml": CONFIG,
    "garden/Plant.md": "Seed.",
    "garden/Thư mục/Cây.md": "Lá.",
    "README.md": "Not the vault.",
  })
  commit(dir, "2026-03-04T10:00:00Z", { "garden/Plant.md": "Seed, then shoot." })
  return dir
}

afterAll(() => {
  for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
  Object.assign(site, saved)
  g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("dates from git", () => {
  test("a note is created at its first commit and updated at its last, also in a folder of the repository", () => {
    const vault = useVault(path.join(repo("full"), "garden"))
    const plant = vault.byKey["en-US"].get("Plant")!
    expect([iso(plant.created), iso(plant.updated)]).toEqual(["2026-01-02T10:00:00.000Z", "2026-03-04T10:00:00.000Z"])
    const leaf = vault.byKey["en-US"].get("Thư mục/Cây")!
    expect([iso(leaf.created), iso(leaf.updated)]).toEqual(["2026-01-02T10:00:00.000Z", "2026-01-02T10:00:00.000Z"])
    expect(gitProblems(vault)).toEqual([])
  })

  test("a vault outside any repository takes the file times, and that is no problem", () => {
    const dir = path.join(tmp, "plain")
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, "datme.yaml"), CONFIG)
    fs.writeFileSync(path.join(dir, "Plant.md"), "Seed.")
    const vault = useVault(dir)
    expect(iso(vault.byKey["en-US"].get("Plant")!.updated)).toBe(fs.statSync(path.join(dir, "Plant.md")).mtime.toISOString())
    expect(gitProblems(vault)).toEqual([])
  })

  test("a shallow clone is a warning that says how to fetch the history", () => {
    const origin = repo("origin")
    const clone = path.join(tmp, "clone")
    git(tmp, "clone", "-q", "--depth", "1", `file://${origin}`, clone)
    const vault = useVault(path.join(clone, "garden"))
    expect(gitProblems(vault)).toEqual([
      "warning: shallow clone: notes older than the clone get its date; fetch the whole history (GIT_DEPTH: 0 on GitLab, fetch-depth: 0 on GitHub)",
    ])
    // What the clone holds is still read: the one commit it has.
    expect(iso(vault.byKey["en-US"].get("Plant")!.created)).toBe("2026-03-04T10:00:00.000Z")
  })

  test("a git that fails is a warning, and the notes fall back to the file times", () => {
    const dir = repo("broken")
    // Without its tree, git cannot list the files of the last commit.
    const tree = git(dir, "rev-parse", "HEAD^{tree}")
    fs.rmSync(path.join(dir, ".git/objects", tree.slice(0, 2), tree.slice(2)))
    const vault = useVault(path.join(dir, "garden"))
    const problems = gitProblems(vault)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toStartWith("warning: dates come from file times: git failed (")
    expect(problems[0]).toContain(tree)
    const file = path.join(dir, "garden/Plant.md")
    expect(iso(vault.byKey["en-US"].get("Plant")!.updated)).toBe(fs.statSync(file).mtime.toISOString())
  })
})

describe("reading a long output line by line", () => {
  test("in chunks of any size, with characters split across chunks kept whole", () => {
    const file = path.join(tmp, "lines.txt")
    const text = "\x00123\nThư mục/Cây.md\n\nđ\nlast without a newline"
    fs.writeFileSync(file, text)
    for (const chunk of [1, 2, 3, 7, 1 << 20]) {
      const fd = fs.openSync(file, "r")
      const lines: string[] = []
      try {
        eachLine(fd, (line) => lines.push(line), chunk)
      } finally {
        fs.closeSync(fd)
      }
      expect(lines).toEqual(text.split("\n"))
    }
  })
})
