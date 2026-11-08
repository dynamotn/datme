import { expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

/**
 * Coverage counts only the files some test loads: a module no test reaches
 * would pass the 100% gate unseen. This follows the imports of every test
 * file through src/ and bin/, and loads each module of src/ left over (the
 * .astro files are Astro's to compile, the .d.ts files have no code), so it
 * shows up uncovered, and fails naming it.
 *
 * It reads the imports instead of loading every module itself: the client
 * scripts bind to the shared test document when first imported, so loading
 * one here, before the test file that owns it, would change what that file
 * sees.
 */

const repo = path.resolve(import.meta.dir, "..")
const src = path.join(repo, "src")
const transpiler = new Bun.Transpiler({ loader: "ts" })

/** The files of the repository a module loads, static and dynamic imports alike; types only load nothing. */
function importsOf(file: string): string[] {
  return transpiler.scanImports(fs.readFileSync(file, "utf8")).flatMap(({ path: spec }) => {
    try {
      const found = Bun.resolveSync(spec, path.dirname(file))
      return found.startsWith(repo) && !found.includes("/node_modules/") ? [found] : []
    } catch {
      // Vite's ?url assets and Astro's virtual modules: nothing of ours.
      return []
    }
  })
}

test("every module of src/ is loaded by some test", async () => {
  const tests = [...new Bun.Glob("**/*.ts").scanSync(import.meta.dir)].map((f) => path.join(import.meta.dir, f))
  const reached = new Set<string>()
  const queue = [...tests]
  for (let file = queue.pop(); file; file = queue.pop()) {
    for (const dep of importsOf(file)) {
      if (reached.has(dep)) continue
      reached.add(dep)
      // JSON, CSS and the like import nothing further.
      if (/\.[mc]?[jt]sx?$/.test(dep)) queue.push(dep)
    }
  }
  const modules = [...new Bun.Glob("**/*.{ts,js,mjs}").scanSync(src)].filter((f) => !f.endsWith(".d.ts")).map((f) => path.join(src, f))
  expect(modules.length).toBeGreaterThan(100)
  expect(reached.has(path.join(src, "scripts/app.ts"))).toBe(true)

  const unreached = modules.filter((m) => !reached.has(m))
  for (const m of unreached) await import(m).catch(() => {})
  expect(unreached.map((m) => path.relative(repo, m))).toEqual([])
})
