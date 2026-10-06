import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadUserPlugins, NO_PLUGINS } from "../src/lib/user-plugins"

const root = path.resolve(import.meta.dir, "..")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-plugins-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

// Marks every paragraph, so the build shows the plugin ran.
const PLUGIN = `export default {
  rehypePlugins: [() => (tree) => {
    const walk = (n) => {
      if (n.type === "element" && n.tagName === "p") n.properties.className = ["from-plugin"]
      ;(n.children || []).forEach(walk)
    }
    walk(tree)
  }],
}
`

describe("datme.config.mjs", () => {
  test("a vault without one has no plugins", async () => {
    expect(await loadUserPlugins(tmp)).toEqual(NO_PLUGINS)
  })

  test("plugins load with a signature of the file", async () => {
    const dir = path.join(tmp, "ok")
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, "datme.config.mjs"), PLUGIN)
    const p = await loadUserPlugins(dir)
    expect(p.rehype).toHaveLength(1)
    expect(p.remark).toEqual([])
    expect(p.signature).toMatch(/^[0-9a-f]{64}$/)
  })

  test("mistakes are explained", async () => {
    const config = async (name: string, source: string) => {
      const dir = path.join(tmp, name)
      fs.mkdirSync(dir)
      fs.writeFileSync(path.join(dir, "datme.config.mjs"), source)
      return loadUserPlugins(dir)
    }
    await expect(config("names", "export default { remarkPlugins: ['remark-emoji'] }")).rejects.toThrow(
      "every entry of remarkPlugins must be a plugin function",
    )
    await expect(config("object", "export default { rehypePlugins: {} }")).rejects.toThrow("rehypePlugins must be a list of plugins")
    await expect(config("syntax", "export default {")).rejects.toThrow("Cannot load")
  })

  test("a build runs the vault's plugins on every note", () => {
    const vault = path.join(tmp, "vault")
    fs.cpSync(path.join(root, "tests/fixtures/minimal"), vault, { recursive: true })
    fs.writeFileSync(path.join(vault, "datme.config.mjs"), PLUGIN)
    const out = path.join(tmp, "site")
    const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
      stdout: "pipe",
      stderr: "pipe",
    })
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
    expect(fs.readFileSync(path.join(out, "Hello/index.html"), "utf8")).toContain('<p class="from-plugin">My first public note')
    // The config file is code, never published.
    expect(fs.existsSync(path.join(out, "assets/datme.config.mjs"))).toBe(false)
  }, 180_000)
})
