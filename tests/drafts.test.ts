import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { isDraft, isPublished } from "../src/lib/vault"
import { parseArgs } from "../src/cli"

const now = new Date("2024-05-10T12:00:00Z")

describe("drafts", () => {
  test("drafts and scheduled notes only build with --drafts; publish: false never does", () => {
    expect(isDraft({ draft: true }, now)).toBe(true)
    expect(isDraft({ publish_date: "2024-06-01" }, now)).toBe(true)
    expect(isPublished({ publish: true, draft: true }, "explicit", now, true)).toBe(true)
    expect(isPublished({ publish: true, draft: true }, "explicit", now, false)).toBe(false)
    expect(isPublished({ draft: true }, "explicit", now, true)).toBe(false)
    expect(isPublished({ publish: false, draft: true }, "all", now, true)).toBe(false)
    expect(parseArgs(["build", "--drafts"])).toMatchObject({ command: "build", drafts: true })
  })

  const root = path.resolve(import.meta.dir, "..")
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-drafts-"))
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  test("a --drafts build shows them marked as drafts and out of search engines", () => {
    const out = path.join(tmp, "site")
    const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", path.join(root, "tests/fixtures/vault"), "--out", out, "--drafts"], {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
      stdout: "pipe",
      stderr: "pipe",
    })
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
    const draft = fs.readFileSync(path.join(out, "01_Fleeting/Future/index.html"), "utf8")
    expect(draft).toContain('<meta name="robots" content="noindex">')
    expect(draft).toContain('<p class="draft-banner" role="note">')
    const published = fs.readFileSync(path.join(out, "03_Atomic/Zettelkasten/index.html"), "utf8")
    expect(published).not.toContain("noindex")
    expect(published).not.toContain('class="draft-banner"')
  }, 180_000)
})
