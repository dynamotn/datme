import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Runs `code` in a process of its own, against a vault made of `files`, since
 * the vault and its config are read once per process. `$src` in the code is
 * the path of datme's sources. Returns the last line it printed, parsed as
 * JSON, and what it wrote to stderr.
 */
export function probeVault(files: Record<string, string>, code: string): { result: any; stderr: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-probe-"))
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text)
  }
  // A dotfile, so the vault never reads it as a file of its own.
  const script = path.join(dir, ".probe.ts")
  fs.writeFileSync(script, code.replaceAll("$src", path.resolve(import.meta.dir, "../src")) + "\nprocess.exit(0)\n")
  const proc = Bun.spawnSync(["bun", script], { env: { ...process.env, VAULT_PATH: dir, DATME_CACHE: "" } })
  fs.rmSync(dir, { recursive: true, force: true })
  const stderr = proc.stderr.toString()
  const last = proc.stdout.toString().trim().split("\n").pop()
  if (!last) throw new Error(`probe printed nothing:\n${stderr}`)
  return { result: JSON.parse(last), stderr }
}
