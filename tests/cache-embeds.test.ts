import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Builds a small vault of embeds through the CLI, keeping the cache between builds.
const root = path.resolve(import.meta.dir, "..")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-cache-embeds-"))
const vault = path.join(tmp, "vault")
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const note = (name: string, body: string) => fs.writeFileSync(path.join(vault, `${name}.md`), `---\npublish: true\n---\n${body}\n`)
function build(out: string, cache: string): void {
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", path.join(tmp, out)], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: path.join(tmp, cache) },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
}
const words = (out: string, p: string) => fs.readFileSync(path.join(tmp, out, p, "index.html"), "utf8").match(/\b(alpha|beta|gamma)\b/g)

describe("embeds in the build cache", () => {
  test("an embed cached along one chain of embeds is not reused along another", () => {
    fs.mkdirSync(vault)
    note("A", "alpha\n\n![[B]]")
    note("B", "beta\n\n![[A]]")
    build("first", "cache")
    note("C", "gamma\n\n![[B]]")
    build("cached", "cache")
    build("fresh", "empty")
    // Inside A, B cuts its embed of A; inside C it shows A whole.
    expect(words("cached", "C")).toEqual(words("fresh", "C"))
    expect(words("cached", "C")).toContain("alpha")
  }, 60_000)
})
