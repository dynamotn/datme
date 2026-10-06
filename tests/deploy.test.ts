import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { load as loadYaml } from "js-yaml"
import { deployFiles, projectName, TARGETS } from "../src/lib/deploy"
import { parseArgs, run, CliError } from "../src/cli"

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "datme-deploy-")))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
const opts = { vault: "notes/My Vault", branch: "trunk", project: "my-garden" }

describe("deployFiles", () => {
  test("every host gets a valid configuration that builds the vault on its branch", () => {
    for (const target of TARGETS) {
      const [file] = deployFiles(target, opts)
      expect(file.content).toContain("bunx datme build 'notes/My Vault' --out")
      expect(file.content).toContain("trunk")
      if (file.path.endsWith(".yml")) expect(() => loadYaml(file.content)).not.toThrow()
      else expect(() => Bun.TOML.parse(file.content)).not.toThrow()
    }
  })

  test("GitHub Pages: full history for dates, a build cache, and the Pages deploy", () => {
    const [file] = deployFiles("github", opts)
    expect(file.path).toBe(".github/workflows/datme.yml")
    const wf = loadYaml(file.content) as { on: { push: { branches: string[] } }; jobs: Record<string, { steps: { uses?: string; with?: Record<string, unknown> }[] }> }
    expect(wf.on.push.branches).toEqual(["trunk"])
    const steps = wf.jobs.build.steps
    expect(steps[0].with).toEqual({ "fetch-depth": 0 })
    expect(steps.some((s) => s.uses === "actions/cache@v4")).toBe(true)
    expect(wf.jobs.deploy.steps[0].uses).toBe("actions/deploy-pages@v4")
  })

  test("GitLab Pages publishes public/, Cloudflare reads its credentials from secrets", () => {
    const gitlab = loadYaml(deployFiles("gitlab", opts)[0].content) as { pages: { artifacts: { paths: string[] } } }
    expect(gitlab.pages.artifacts.paths).toEqual(["public"])
    const cf = deployFiles("cloudflare", opts)[0].content
    expect(cf).toContain("${{ secrets.CLOUDFLARE_API_TOKEN }}")
    expect(cf).toContain("--project-name=my-garden")
  })

  test("project names are what Cloudflare accepts", () => {
    expect(projectName("Khu Vườn của Tôi!")).toBe("khu-vuon-cua-toi")
    expect(projectName("***")).toBe("garden")
  })
})

describe("datme deploy", () => {
  test("the host comes before the vault, and must be known", () => {
    expect(parseArgs(["deploy", "github", "~/Notes", "--branch", "pages"])).toMatchObject({
      command: "deploy",
      target: "github",
      vault: "~/Notes",
      branch: "pages",
    })
    expect(() => parseArgs(["deploy"])).toThrow("Missing host")
    expect(() => parseArgs(["deploy", "vercel"])).toThrow('Unknown host "vercel"')
  })

  test("writes at the root of the repository holding the vault, and never overwrites", async () => {
    const repo = path.join(tmp, "repo")
    fs.mkdirSync(path.join(repo, "vault"), { recursive: true })
    Bun.spawnSync(["git", "init", "-q", "-b", "garden", repo])
    await run({ command: "deploy", target: "github", vault: path.join(repo, "vault") }, {}, tmp)
    const wf = fs.readFileSync(path.join(repo, ".github/workflows/datme.yml"), "utf8")
    expect(wf).toContain("bunx datme build vault --out _site")
    expect(wf).toContain("branches: [garden]")
    const again = await run({ command: "deploy", target: "github", vault: path.join(repo, "vault") }, {}, tmp).catch((e) => e)
    expect(again).toBeInstanceOf(CliError)
    expect((again as Error).message).toContain("already exists")
  })
})
