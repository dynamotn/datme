import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// End-to-end: a vault with a folder in each style, built once.
const root = path.resolve(import.meta.dir, "..")
const vault = path.join(root, "tests/fixtures/looks")
let out = ""
const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8")
/** The stylesheet a page links for its look, by the name of its source file. */
const lookSheet = (html: string) => html.match(/<link rel="stylesheet" href="[^"]*\/([a-z]+)\.[^"]*\.css" data-css="3"/)?.[1]

beforeAll(() => {
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-looks-")), "site")
  const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
}, 180_000)

afterAll(() => {
  fs.rmSync(path.dirname(out), { recursive: true, force: true })
})

describe("terminal look", () => {
  test("a note in a terminal folder links its sheet and opens dark", () => {
    const html = read("Shell/Uptime/index.html")
    expect(html).toContain('data-look="terminal"')
    expect(html).toContain('data-scheme-default="dark"')
    expect(lookSheet(html)).toBe("terminal")
    expect(html).toContain('<meta name="theme-color" content="#090c09" media="(prefers-color-scheme: dark)"')
  })
})
