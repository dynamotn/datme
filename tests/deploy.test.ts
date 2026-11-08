import { afterAll, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { load as loadYaml } from "js-yaml"
import { deployFiles, PREVIEW_STEPS, projectName, TARGETS, TRANSFORMERS_VERSION } from "../src/lib/deploy"
import { parseArgs, run, CliError } from "../src/cli"
import pkg from "../package.json"

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "datme-deploy-")))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
const opts = { vault: "notes/My Vault", branch: "trunk", project: "my-garden" }

describe("deployFiles", () => {
  test("every host gets a valid configuration that builds the vault on its branch", () => {
    for (const target of TARGETS) {
      const [file] = deployFiles(target, opts)
      expect(file.content).toContain(`bunx @dynamotn/datme@${pkg.version} build 'notes/My Vault' --out`)
      expect(file.content).toContain("trunk")
      if (file.path.endsWith(".yml")) expect(() => loadYaml(file.content)).not.toThrow()
      else expect(() => Bun.TOML.parse(file.content)).not.toThrow()
    }
  })

  test("GitHub Pages: full history for dates, a build cache, and the Pages deploy", () => {
    const [file] = deployFiles("github", opts)
    expect(file.path).toBe(".github/workflows/datme.yml")
    const wf = loadYaml(file.content) as {
      on: { push: { branches: string[] } }
      jobs: Record<string, { steps: { uses?: string; with?: Record<string, unknown> }[] }>
    }
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

  test("pipelines run this exact datme and Bun, and only the deploy job may publish", () => {
    for (const target of TARGETS) {
      const [file] = deployFiles(target, opts)
      expect(file.content).toContain(`bunx @dynamotn/datme@${pkg.version} build`)
    }
    expect(deployFiles("gitlab", opts)[0].content).toMatch(/image: oven\/bun:\d+\.\d+\.\d+\n/)
    expect(deployFiles("netlify", opts)[0].content).toMatch(/bun\.sh\/install \| bash -s bun-v\d+\.\d+\.\d+ /)
    type Job = { permissions?: Record<string, string> }
    const gh = loadYaml(deployFiles("github", opts)[0].content) as { permissions: Record<string, string>; jobs: Record<string, Job> }
    expect(gh.permissions).toEqual({ contents: "read" })
    expect(gh.jobs.build.permissions).toBeUndefined()
    expect(gh.jobs.deploy.permissions).toEqual({ pages: "write", "id-token": "write" })
  })

  test("semantic: true installs datme and transformers.js together, and runs that datme", () => {
    const install = `bun add --global @dynamotn/datme@${pkg.version} @huggingface/transformers@${TRANSFORMERS_VERSION} && `
    for (const target of TARGETS) {
      const [file] = deployFiles(target, { ...opts, semantic: true })
      const bun = target === "netlify" ? "~/.bun/bin/" : ""
      const command = `${bun}${install}"$(${bun}bun pm bin -g)/datme" build 'notes/My Vault' --out`
      if (file.path.endsWith(".yml")) {
        expect(file.content).toContain(command)
        expect(() => loadYaml(file.content)).not.toThrow()
      } else {
        // TOML escapes the quotes of the command.
        expect(Bun.TOML.parse(file.content)).toMatchObject({ build: { command: expect.stringContaining(command) } })
      }
      expect(file.content).not.toContain("bunx")
    }
    for (const target of TARGETS) expect(deployFiles(target, { ...opts, semantic: false })[0].content).toBe(deployFiles(target, opts)[0].content)
  })

  test("tts: false leaves every pipeline exactly as it was", () => {
    for (const target of TARGETS) {
      expect(deployFiles(target, { ...opts, tts: false })[0].content).toBe(deployFiles(target, opts)[0].content)
      expect(deployFiles(target, opts)[0].content).not.toMatch(/UV_CACHE_DIR|HF_HOME|astral\.sh|DATME_TTS_VOICE/)
    }
  })

  test("tts: true installs uv and keeps its downloads in .datme-tts, which the cache saves and never prunes", () => {
    const gitlab = deployFiles("gitlab", { ...opts, tts: true })[0].content
    const parsed = loadYaml(gitlab) as { pages: { variables: Record<string, string>; before_script: string[]; script: string[]; cache: { paths: string[] } } }
    expect(parsed.pages.variables).toMatchObject({ UV_CACHE_DIR: ".datme-tts/uv", HF_HOME: ".datme-tts/hf" })
    expect(parsed.pages.cache.paths).toEqual([".datme-cache", ".datme-tts"])
    expect(parsed.pages.before_script.join("\n")).toContain("https://astral.sh/uv/0.10.6/install.sh")
    expect(parsed.pages.before_script.join("\n")).toContain("curl")

    for (const target of ["github", "cloudflare"] as const) {
      const wf = loadYaml(deployFiles(target, { ...opts, tts: true })[0].content) as {
        jobs: Record<string, { env: Record<string, string>; steps: { run?: string; uses?: string; with?: { path?: string } }[] }>
      }
      const job = Object.values(wf.jobs)[0]
      expect(job.env).toMatchObject({ UV_CACHE_DIR: ".datme-tts/uv", HF_HOME: ".datme-tts/hf" })
      expect(job.steps.some((s) => s.run?.includes("https://astral.sh/uv/0.10.6/install.sh"))).toBe(true)
      expect(job.steps.some((s) => s.run?.includes("uv/install.sh"))).toBe(false)
    }
  })

  test("tts: true decodes the GitHub and Cloudflare voice clip from DATME_TTS_VOICE_B64 outside the workspace, refusing an empty one", () => {
    const github = deployFiles("github", { ...opts, tts: true })[0].content
    expect(github).toContain("secrets.DATME_TTS_VOICE_B64")
    expect(github).not.toMatch(/DATME_TTS_VOICE_B64: [^$\s]/)
    expect(github).toContain('base64 -d > "$RUNNER_TEMP/voice.ogg"')
    expect(github).toContain('echo "DATME_TTS_VOICE=$RUNNER_TEMP/voice.ogg" >> "$GITHUB_ENV"')

    for (const target of ["github", "cloudflare"] as const) {
      const content = deployFiles(target, { ...opts, tts: true })[0].content
      const guard = content.indexOf('test -s "$RUNNER_TEMP/voice.ogg" || { echo "DATME_TTS_VOICE_B64 is empty or missing" >&2; exit 1; }')
      expect(guard).toBeGreaterThan(content.indexOf("base64 -d"))
      expect(content.indexOf('chmod 600 "$RUNNER_TEMP/voice.ogg"')).toBeGreaterThan(guard)
    }
  })

  test("tts: true fetches the GitLab voice clip from a Secure File, outside the workspace and never as an artifact", () => {
    const content = deployFiles("gitlab", { ...opts, tts: true })[0].content
    const gitlab = loadYaml(content) as { pages: { variables: Record<string, string>; script: string[]; artifacts: { paths: string[] } } }
    const script = gitlab.pages.script.map((l) => l.trim())
    const at = (needle: string) => script.findIndex((l) => l.includes(needle))

    expect(gitlab.pages.variables.DATME_TTS_VOICE_FILE).toBe("voice.wav")
    expect(content).not.toContain("DATME_TTS_VOICE_B64")
    expect(content).not.toContain("base64")
    expect(script[at("VOICE_LIST=$(")]).toContain('--header "JOB-TOKEN: $CI_JOB_TOKEN" "$CI_API_V4_URL/projects/$CI_PROJECT_ID/secure_files?per_page=100"')
    expect(script[at("/download")]).toContain('curl -sSf --header "JOB-TOKEN: $CI_JOB_TOKEN"')
    expect(script[at("/download")]).toContain('-o "$VOICE_DIR/$DATME_TTS_VOICE_FILE"')
    expect(script[at("/download")]).toContain("secure_files/$VOICE_ID/download")
    expect(script[at("bun -e")]).toContain("x.name === n")
    expect(script[at("bun -e")]).toContain("not found")
    expect(script[at("bun -e")]).toContain("process.exit(1)")

    expect(script[at("VOICE_LIST=$(")]).toContain('|| { echo "Could not list Secure Files')
    expect(script[at("VOICE_LIST=$(")]).toContain("exit 1; }")
    expect(script[at("/download")]).toContain('|| { echo "Could not download Secure File')
    expect(script[at("/download")]).toContain("exit 1; }")
    expect(script[at("VOICE_DIR=$(mktemp -d)")]).toContain('chmod 700 "$VOICE_DIR"')
    expect(content).not.toContain("/tmp/datme-voice")
    expect(content).not.toContain("CI_PROJECT_DIR")
    expect(script[at("VOICE_LIST=$(")]).toContain("secure_files?per_page=100")
    expect(at("VOICE_DIR=$(mktemp -d)")).toBeGreaterThanOrEqual(0)
    expect(at("VOICE_DIR=$(mktemp -d)")).toBeLessThan(at("/download"))
    expect(at("VOICE_LIST=$(")).toBeLessThan(at("bun -e"))
    expect(at("bun -e")).toBeLessThan(at("/download"))
    expect(at("VOICE_ID=")).toBeLessThan(at("/download"))
    const guard = at('test -s "$VOICE_DIR/$DATME_TTS_VOICE_FILE" ||')
    expect(guard).toBeGreaterThan(at("/download"))
    expect(at('chmod 600 "$VOICE_DIR/$DATME_TTS_VOICE_FILE"')).toBeGreaterThan(guard)
    expect(at('export DATME_TTS_VOICE="$VOICE_DIR/$DATME_TTS_VOICE_FILE"')).toBeGreaterThan(guard)
    expect(at("export DATME_TTS_VOICE=")).toBeLessThan(at(" build "))
    expect(gitlab.pages.artifacts.paths).toEqual(["public"])
    expect(content).not.toContain("set -x")
  })

  test("tts: true saves the cache even when the build fails, so a long first run continues where it stopped", () => {
    const gitlab = loadYaml(deployFiles("gitlab", { ...opts, tts: true })[0].content) as { pages: { cache: { when: string } } }
    expect(gitlab.pages.cache.when).toBe("always")
    expect(deployFiles("gitlab", opts)[0].content).not.toContain("when: always")

    for (const target of ["github", "cloudflare"] as const) {
      type Step = { run?: string; uses?: string; if?: string; with?: { path: string; key: string } }
      const wf = loadYaml(deployFiles(target, { ...opts, tts: true })[0].content) as { jobs: Record<string, { steps: Step[] }> }
      const steps = Object.values(wf.jobs)[0].steps
      const restore = steps.findIndex((s) => s.uses === "actions/cache/restore@v4")
      const save = steps.findIndex((s) => s.uses === "actions/cache/save@v4")
      const built = steps.findIndex((s) => s.run?.includes(" build "))
      expect(restore).toBeGreaterThanOrEqual(0)
      expect(restore).toBeLessThan(built)
      expect(save).toBeGreaterThan(built)
      expect(steps[save].if).toBe("always()")
      expect(steps[save].with?.key).toBe(steps[restore].with?.key)
      expect(steps[save].with?.path.trim().split("\n")).toEqual([".datme-cache", ".datme-tts"])
      expect(steps.some((s) => s.uses === "actions/cache@v4")).toBe(false)
    }
  })

  test("netlify with tts turns audio off in the build environment", () => {
    const toml = deployFiles("netlify", { ...opts, tts: true })[0].content
    expect(toml).toMatch(/\[build\.environment\]\n {2}ASTRO_TELEMETRY_DISABLED = "1"\n {2}DATME_TTS = "off"/)
    expect(toml.match(/\[build\.environment\]/g)).toHaveLength(1)
    expect(deployFiles("netlify", opts)[0].content).not.toContain("DATME_TTS")
  })

  test("previews: false leaves every pipeline exactly as it was", () => {
    for (const target of TARGETS) expect(deployFiles(target, { ...opts, previews: false })).toEqual(deployFiles(target, opts))
  })

  test("previews: true builds each merge or pull request with drafts, out of search engines, at its own address", () => {
    const flags = "--drafts --noindex --site"
    for (const extra of [{}, { tts: true }, { semantic: true }]) {
      const o = { ...opts, ...extra, previews: true }
      for (const target of ["gitlab", "netlify", "cloudflare"] as const) {
        for (const file of deployFiles(target, o)) {
          if (file.path.endsWith(".yml")) expect(() => loadYaml(file.content)).not.toThrow()
          else expect(() => Bun.TOML.parse(file.content)).not.toThrow()
        }
      }
      // The published site is built as before.
      expect(deployFiles("gitlab", o)[0].content).toStartWith(deployFiles("gitlab", { ...o, previews: false })[0].content)
      expect(deployFiles("cloudflare", o)[0]).toEqual(deployFiles("cloudflare", { ...o, previews: false })[0])
    }

    type GitlabJob = {
      variables: Record<string, string>
      script: string[]
      rules: { if: string }[]
      environment: Record<string, string>
      pages: Record<string, string>
      cache?: unknown
      artifacts: { paths: string[] }
    }
    const gitlab = loadYaml(deployFiles("gitlab", { ...opts, previews: true })[0].content) as Record<string, GitlabJob>
    const job = gitlab["pages-preview"]
    expect(job.rules).toEqual([{ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' }])
    expect(job.pages.path_prefix).toBe("mr-$CI_MERGE_REQUEST_IID")
    expect(job.environment).toEqual({ name: "preview/mr-$CI_MERGE_REQUEST_IID", url: "$CI_PAGES_URL" })
    // GitLab keeps the caches of protected and unprotected refs apart, so a preview would restore nothing.
    expect(job.cache).toBeUndefined()
    expect(job.artifacts.paths).toEqual(["public"])
    // The comment's token never reaches the build.
    expect(job.script[0]).toBe(`(unset DATME_PREVIEW_TOKEN; bunx @dynamotn/datme@${pkg.version} build 'notes/My Vault' --out public ${flags} "$CI_PAGES_URL")`)
    // The token is a masked CI/CD variable, read only when set, and a failed comment does not fail the job.
    expect(job.script[1]).toStartWith('if [ -n "$DATME_PREVIEW_TOKEN" ]; then bun -e ')
    expect(job.script[1]).toContain('else echo "DATME_PREVIEW_TOKEN is not set, so the preview is not commented on the merge request"; fi')
    expect(job.script[1]).toContain('"PRIVATE-TOKEN": process.env.DATME_PREVIEW_TOKEN')
    expect(job.script[1]).toContain("/merge_requests/")
    expect(job.script[1]).toContain("!notes.some((n) => n.body === body)")
    expect(job.script[1]).not.toContain("process.exit")
    expect(job.variables.DATME_TTS).toBeUndefined()
    const gitlabText = deployFiles("gitlab", { ...opts, previews: true })[0].content
    for (const warning of [
      "anyone can guess and open",
      "Limit Pages to project members",
      "cannot be protected",
      "from forks",
      "ignores _headers",
      "same host",
    ]) {
      expect(gitlabText.replace(/\n# /g, " ")).toContain(warning)
    }
    expect(
      (loadYaml(deployFiles("gitlab", { ...opts, tts: true, previews: true })[0].content) as Record<string, GitlabJob>)["pages-preview"].variables.DATME_TTS,
    ).toBe("off")

    // Netlify builds deploy previews and comments them itself; only the command changes.
    const netlify = Bun.TOML.parse(deployFiles("netlify", { ...opts, previews: true })[0].content) as { context: { "deploy-preview": { command: string } } }
    expect(netlify.context["deploy-preview"].command).toEndWith(
      `bunx @dynamotn/datme@${pkg.version} build 'notes/My Vault' --out dist ${flags} "$DEPLOY_PRIME_URL"`,
    )
    expect(deployFiles("netlify", { ...opts, previews: true })).toHaveLength(1)
    expect(deployFiles("netlify", { ...opts, previews: true })[0].content.replace(/\n# /g, " ")).toContain(
      "anyone can guess and open; noindex only keeps search engines away. Protect them with a password or SSO",
    )

    type Step = { id?: string; run?: string; uses?: string; with?: Record<string, string | number | boolean>; env?: Record<string, string> }
    type Workflow = {
      on: Record<string, unknown>
      permissions: Record<string, string>
      jobs: { preview: { if: string; permissions: Record<string, string>; env: Record<string, string>; steps: Step[] } }
    }
    const files = deployFiles("cloudflare", { ...opts, previews: true })
    expect(files.map((f) => f.path)).toEqual([".github/workflows/datme-cloudflare.yml", ".github/workflows/datme-preview.yml"])
    const wf = loadYaml(files[1].content) as Workflow
    expect(Object.keys(wf.on)).toEqual(["pull_request"])
    expect(wf.permissions).toEqual({})
    const preview = wf.jobs.preview
    expect(preview.permissions).toEqual({ contents: "read", "pull-requests": "write" })
    expect(preview.if).toBe("github.event.pull_request.head.repo.full_name == github.repository")
    expect(preview.steps[0]).toEqual({ uses: "actions/checkout@v4", with: { "fetch-depth": 0, "persist-credentials": false } })
    // The build runs before the deploy, so it guesses its address; a repository variable overrides the subdomain.
    expect(preview.env.SITE_URL).toBe("https://pr-${{ github.event.number }}.${{ vars.DATME_PAGES_SUBDOMAIN || 'my-garden' }}.pages.dev")
    expect(preview.env.DATME_TTS).toBeUndefined()
    expect(preview.steps.some((s) => s.run === `bunx @dynamotn/datme@${pkg.version} build 'notes/My Vault' --out dist ${flags} "$SITE_URL"`)).toBe(true)
    expect(files[1].content.replace(/\n# /g, " ")).toContain("anyone can guess and open; noindex only keeps search engines away. Turn on Cloudflare Access")
    const deploy = preview.steps.find((s) => s.uses === "cloudflare/wrangler-action@v3")!
    expect(deploy.id).toBe("deploy")
    expect(deploy.with?.apiToken).toBe("${{ secrets.CLOUDFLARE_API_TOKEN }}")
    expect(deploy.with?.command).toBe("pages deploy dist --project-name=my-garden --branch=pr-${{ github.event.number }}")
    const comment = preview.steps.at(-1)!
    expect(comment.run).toBe('gh pr comment "$PR" --body "Preview at $PREVIEW_URL" --edit-last --create-if-none')
    expect(comment.env?.GH_TOKEN).toBe("${{ github.token }}")
    // The comment links the address Cloudflare returns, not the guessed one.
    expect(comment.env?.PREVIEW_URL).toBe("${{ steps.deploy.outputs.pages-deployment-alias-url || env.SITE_URL }}")
    expect((loadYaml(deployFiles("cloudflare", { ...opts, tts: true, previews: true })[1].content) as Workflow).jobs.preview.env.DATME_TTS).toBe("off")
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

  test("--previews is for deploy, and refused for GitHub Pages, which cannot host previews", () => {
    expect(parseArgs(["deploy", "gitlab", "--previews"])).toMatchObject({ target: "gitlab", previews: true })
    expect(parseArgs(["deploy", "gitlab"]).previews).toBeUndefined()
    expect(parseArgs(["build", "--previews"]).previews).toBeUndefined()
    expect(() => parseArgs(["deploy", "github", "--previews"])).toThrow("cannot host previews")
    expect(parseArgs(["build", "--noindex"])).toMatchObject({ command: "build", noindex: true })
    expect(parseArgs(["build"]).noindex).toBeUndefined()
  })

  test("--previews writes the preview workflow next to the pipeline", async () => {
    const repo = path.join(tmp, "previews")
    fs.mkdirSync(repo, { recursive: true })
    Bun.spawnSync(["git", "init", "-q", "-b", "main", repo])
    const log = spyOn(console, "log").mockImplementation(() => {})
    try {
      await run({ command: "deploy", target: "cloudflare", vault: repo, previews: true }, {}, tmp)
      expect(log).toHaveBeenLastCalledWith(PREVIEW_STEPS.cloudflare)
    } finally {
      log.mockRestore()
    }
    expect(fs.readFileSync(path.join(repo, ".github/workflows/datme-preview.yml"), "utf8")).toContain("--branch=pr-${{ github.event.number }}")
    expect(fs.existsSync(path.join(repo, ".github/workflows/datme-cloudflare.yml"))).toBe(true)
  })

  test("writes at the root of the repository holding the vault, and never overwrites", async () => {
    const repo = path.join(tmp, "repo")
    fs.mkdirSync(path.join(repo, "vault"), { recursive: true })
    Bun.spawnSync(["git", "init", "-q", "-b", "garden", repo])
    await run({ command: "deploy", target: "github", vault: path.join(repo, "vault") }, {}, tmp)
    const wf = fs.readFileSync(path.join(repo, ".github/workflows/datme.yml"), "utf8")
    expect(wf).toContain(`bunx @dynamotn/datme@${pkg.version} build vault --out _site`)
    expect(wf).toContain("branches: [garden]")
    const again = await run({ command: "deploy", target: "github", vault: path.join(repo, "vault") }, {}, tmp).catch((e) => e)
    expect(again).toBeInstanceOf(CliError)
    expect((again as Error).message).toContain("already exists")
  })
})
