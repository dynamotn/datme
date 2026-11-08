/**
 * Checks the package as npm users get it: packs datme, installs the tarball in
 * an empty project with npm, and runs that copy under Node (the `node` on the
 * PATH, or $NODE), building the fixture vault. The repository's own tests run
 * under Bun from the source tree, so they never see a missing file in
 * `files`, a dependency left in devDependencies, or a Node that cannot load
 * what Bun can. Run with `bun tools/pack-check.ts`; CI runs it on each Node
 * that `engines` allows. A second build, of a vault searching with Pagefind,
 * checks that an optional peer loads from the build hook. It also prints the
 * size of the tarball and of the `node_modules` it installs, and fails when that passes MAX_INSTALL_MIB, so a
 * heavy dependency is added on purpose; `tools/bench.ts --install` measures
 * them too. In CI the size is also kept as a GitLab metrics report
 * (`metrics.txt`) and a GitHub job summary.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" }
/** The most `node_modules` may weigh once npm installs datme; raise it on purpose only. */
const MAX_INSTALL_MIB = 400
const run = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })

/** Packs datme into `work` and installs the tarball with npm in an empty project there. */
export function packAndInstall(work: string, node: string): { tarball: string; tarballBytes: number; project: string; datme: string } {
  fs.mkdirSync(work, { recursive: true })
  const tarball = path.join(work, run("npm", ["pack", "--silent", "--pack-destination", work], root).trim().split("\n").pop()!)
  const project = path.join(work, "project")
  fs.mkdirSync(project)
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "pack-check", private: true }))
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", tarball], project)
  const datme = path.join(project, "node_modules/@dynamotn/datme/bin/datme.js")
  // Checked here so a size is never measured from an install that cannot run.
  run(node, [datme, "--version"], project)
  return { tarball, tarballBytes: fs.statSync(tarball).size, project, datme }
}

/** The bytes of the files under a directory. */
function bytesUnder(dir: string): number {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .reduce((sum, e) => sum + fs.statSync(path.join(e.parentPath, e.name)).size, 0)
}

function main(): void {
  const node = process.env.NODE ?? "node"
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "datme-pack-"))
  try {
    const version = run(node, ["--version"], root).trim()
    console.log(`Packing datme for ${version}…`)
    const { project, datme, tarballBytes } = packAndInstall(work, node)
    const installed = run(node, [datme, "--version"], project).trim()
    const expected = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version
    if (installed !== expected) throw new Error(`the installed datme says ${installed}, not ${expected}`)
    const mib = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MiB`
    const modules = path.join(project, "node_modules")
    const installedBytes = bytesUnder(modules)
    const packages = Object.keys(JSON.parse(fs.readFileSync(path.join(modules, ".package-lock.json"), "utf8")).packages).filter(Boolean).length
    const size = `installed node_modules: ${mib(installedBytes)} in ${packages} packages`
    console.log(`Tarball: ${mib(tarballBytes)}; ${size}.`)
    if (process.env.GITLAB_CI)
      fs.writeFileSync(path.join(root, "metrics.txt"), `install_mib ${(installedBytes / 1024 ** 2).toFixed(1)}\ninstall_packages ${packages}\n`)
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Node ${version}: ${size}.\n`)
    if (installedBytes > MAX_INSTALL_MIB * 1024 ** 2)
      throw new Error(`the installed node_modules weighs ${mib(installedBytes)}, over the ${MAX_INSTALL_MIB} MiB of MAX_INSTALL_MIB`)
    const site = path.join(work, "site")
    run(node, [datme, "build", path.join(root, "tests/fixtures/vault"), "--out", site], project)
    for (const page of ["index.html", "03_Atomic/Zettelkasten/index.html", "sitemap-index.xml"]) {
      if (!fs.existsSync(path.join(site, page))) throw new Error(`the build under ${version} has no ${page}`)
    }
    console.log(`datme ${installed}, installed from its tarball, builds the fixture vault under Node ${version}.`)
    // Pagefind is an optional peer, imported from the build hook, which Astro loads differently under Node than under Bun.
    const peers = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).peerDependencies
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", `pagefind@${peers.pagefind}`], project)
    const vault = path.join(work, "pagefind-vault")
    fs.cpSync(path.join(root, "tests/fixtures/minimal"), vault, { recursive: true })
    fs.writeFileSync(path.join(vault, "datme.yaml"), "search:\n  engine: pagefind\n")
    const pagefindSite = path.join(work, "pagefind-site")
    run(node, [datme, "build", vault, "--out", pagefindSite], project)
    if (!fs.existsSync(path.join(pagefindSite, "pagefind/pagefind.js"))) throw new Error(`the build under ${version} wrote no Pagefind index`)
    console.log(`With pagefind installed next to it, it writes the Pagefind index under Node ${version}.`)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

if (import.meta.main) main()
