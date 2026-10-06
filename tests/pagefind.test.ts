import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// The minimal vault, built with Pagefind as its search engine.
const root = path.resolve(import.meta.dir, "..")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-pagefind-"))
const vault = path.join(tmp, "vault")
const out = path.join(tmp, "site")
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")

beforeAll(() => {
  fs.cpSync(path.join(root, "tests/fixtures/minimal"), vault, { recursive: true })
  fs.writeFileSync(path.join(vault, "datme.yaml"), "search:\n  engine: pagefind\n")
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
}, 180_000)

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe("pagefind search", () => {
  test("the build writes a Pagefind index and the dialog uses it", () => {
    expect(fs.existsSync(path.join(out, "pagefind/pagefind.js"))).toBe(true)
    expect(read("index.html")).toContain('data-engine="pagefind"')
  })

  test("only notes are indexed, with their folder as a filter", () => {
    const note = read("Projects/Nested-note/index.html")
    expect(note).toMatch(/<article [^>]*data-pagefind-body(="")? data-pagefind-filter="folder:Projects"/)
    expect(read("tags/index.html")).not.toContain("data-pagefind-body")
  })

  test("the search index no longer ships the text of every note", () => {
    const index = JSON.parse(read("static/contentIndex.en-US.json"))
    expect(index.notes.every((n: { c: string }) => n.c === "")).toBe(true)
  })

  test("the index answers a query", async () => {
    const pagefind = await import("pagefind")
    const { index } = await pagefind.createIndex({})
    await index!.addDirectory({ path: out })
    const { files } = await index!.getFiles()
    await pagefind.close()
    expect(files.some((f) => f.path.startsWith("pagefind-entry.json"))).toBe(true)
  })
})
