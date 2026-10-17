import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { loadUserPlugins, pluginFile } from "../src/lib/user-plugins"

const base = "/Users/dynamo/.claude/jobs/6fc80508/tmp/cov-d"
fs.mkdirSync(base, { recursive: true })
const tmp = fs.mkdtempSync(path.join(base, "plugins-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const config = async (name: string, source: string, file = "datme.config.mjs") => {
  const dir = path.join(tmp, name)
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, file), source)
  return loadUserPlugins(dir)
}

describe("datme.config shapes", () => {
  test("codeBlocks must be an object, not a list or a function", async () => {
    await expect(config("blocks-list", "export default { codeBlocks: [() => ''] }")).rejects.toThrow("codeBlocks must map a fence language to a function")
    await expect(config("blocks-string", "export default { codeBlocks: 'x' }")).rejects.toThrow("codeBlocks must map a fence language to a function")
  })

  test("plugins must be a list, and cannot nest forever", async () => {
    await expect(config("plugins-object", "export default { plugins: { a: 1 } }")).rejects.toThrow("plugins must be a list")
    const nested = "let p = {}\nfor (let i = 0; i < 7; i++) p = { plugins: [p] }\nexport default p"
    await expect(config("plugins-deep", nested)).rejects.toThrow("plugins are nested too deeply")
  })

  test("a datme.config.js without a default export, plugins given as [plugin, options], head as one string", async () => {
    const p = await config(
      "named",
      "const plug = () => () => {}\nexport const remarkPlugins = [[plug, { a: 1 }]]\nexport const head = '<meta name=\"x\">'\nexport const plugins = [{ codeBlocks: {} }]",
      "datme.config.js",
    )
    expect(pluginFile(path.join(tmp, "named"))).toBe(path.join(tmp, "named", "datme.config.js"))
    expect(p.remark).toHaveLength(1)
    expect(p.head).toBe('<meta name="x">\n')
    // A plugin without a name is called by its place.
    expect(p.names).toEqual(["plugins[0]"])
    expect(p.signature).toMatch(/^[0-9a-f]{64}$/)
  })
})
