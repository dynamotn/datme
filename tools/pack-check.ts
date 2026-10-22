/**
 * Checks the package as npm users get it: packs datme, installs the tarball in
 * an empty project with npm, and runs that copy under Node (the `node` on the
 * PATH, or $NODE), building the fixture vault. The repository's own tests run
 * under Bun from the source tree, so they never see a missing file in
 * `files`, a dependency left in devDependencies, or a Node that cannot load
 * what Bun can. Run with `bun tools/pack-check.ts`; CI runs it on each Node
 * that `engines` allows.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const node = process.env.NODE ?? "node"
const work = fs.mkdtempSync(path.join(os.tmpdir(), "datme-pack-"))
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" }
const run = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })

try {
  const version = run(node, ["--version"], root).trim()
  console.log(`Packing datme for ${version}…`)
  const tarball = path.join(work, run("npm", ["pack", "--silent", "--pack-destination", work], root).trim().split("\n").pop()!)
  const project = path.join(work, "project")
  fs.mkdirSync(project)
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "pack-check", private: true }))
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", tarball], project)
  const datme = path.join(project, "node_modules/@dynamotn/datme/bin/datme.js")
  const installed = run(node, [datme, "--version"], project).trim()
  const expected = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version
  if (installed !== expected) throw new Error(`the installed datme says ${installed}, not ${expected}`)
  const site = path.join(work, "site")
  run(node, [datme, "build", path.join(root, "tests/fixtures/vault"), "--out", site], project)
  for (const page of ["index.html", "03_Atomic/Zettelkasten/index.html", "sitemap-index.xml"]) {
    if (!fs.existsSync(path.join(site, page))) throw new Error(`the build under ${version} has no ${page}`)
  }
  console.log(`datme ${installed}, installed from its tarball, builds the fixture vault under Node ${version}.`)
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}
