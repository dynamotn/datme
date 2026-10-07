import { describe, expect, test } from "bun:test"
import path from "node:path"

// The documentation is a datme garden of its own; it must stay free of problems.
describe("the documentation garden", () => {
  test("passes datme check --strict", () => {
    const root = path.resolve(import.meta.dir, "..")
    const proc = Bun.spawnSync(["bun", "bin/datme.ts", "check", "docs", "--strict"], {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "" },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(proc.stdout.toString() + proc.stderr.toString()).toContain("0 errors, 0 warnings")
    expect(proc.exitCode).toBe(0)
  }, 60_000)
})
