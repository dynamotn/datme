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
  plugins: [{
    name: "greeter",
    codeBlocks: { Greet: (source, { lang, meta }) => \`<p class="greeting">Hello, \${source} (\${lang}\${meta ? ", " + meta : ""})</p>\` },
    head: ['<meta name="greeter" content="on">'],
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

  test("plugins bring code block renderers and head tags; their code keys the cache", async () => {
    const dir = path.join(tmp, "bundled")
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, "datme.config.mjs"), PLUGIN)
    const p = await loadUserPlugins(dir)
    expect(p.names).toEqual(["greeter"])
    expect([...p.codeBlocks.keys()]).toEqual(["greet"])
    expect(await p.codeBlocks.get("greet")!("you", { lang: "en", key: "k", meta: "" })).toBe('<p class="greeting">Hello, you (en)</p>')
    expect(p.head).toBe('<meta name="greeter" content="on">\n')
    const other = path.join(tmp, "bundled-2")
    fs.mkdirSync(other)
    fs.writeFileSync(path.join(other, "datme.config.mjs"), PLUGIN.replace("Hello,", "Hi,"))
    expect((await loadUserPlugins(other)).signature).not.toBe(p.signature)
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
    await expect(config("blocks", "export default { codeBlocks: { x: 'html' } }")).rejects.toThrow("codeBlocks.x must be a function")
    await expect(config("head", "export default { head: [1] }")).rejects.toThrow("head must be HTML")
    await expect(config("plugin", "export default { plugins: ['datme-plugin-x'] }")).rejects.toThrow("plugins[0] must be an object")
    await expect(
      config("twice", "const r = () => ''\nexport default { codeBlocks: { x: r }, plugins: [{ name: 'other', codeBlocks: { X: r } }] }"),
    ).rejects.toThrow("(other): codeBlocks.X is already rendered by another plugin")
  })

  test("a build runs the vault's plugins on every note", () => {
    const vault = path.join(tmp, "vault")
    fs.cpSync(path.join(root, "tests/fixtures/minimal"), vault, { recursive: true })
    fs.writeFileSync(path.join(vault, "datme.config.mjs"), PLUGIN)
    fs.writeFileSync(path.join(vault, "Greet.md"), "---\npublish: true\n---\n```greet loud\nreader\n```")
    const out = path.join(tmp, "site")
    const proc = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
      stdout: "pipe",
      stderr: "pipe",
    })
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString() || proc.stdout.toString())
    expect(fs.readFileSync(path.join(out, "Hello/index.html"), "utf8")).toContain('<p class="from-plugin">My first public note')
    const greet = fs.readFileSync(path.join(out, "Greet/index.html"), "utf8")
    // The vault's rehype plugin runs after, and marks the greeting's paragraph too.
    expect(greet).toContain('<p class="from-plugin">Hello, reader (en-US, loud)</p>')
    expect(greet).toContain('<meta name="greeter" content="on">')
    // The config file is code, never published.
    expect(fs.existsSync(path.join(out, "assets/datme.config.mjs"))).toBe(false)
  }, 180_000)
})
