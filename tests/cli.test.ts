import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { load as loadYaml } from "js-yaml"
import { meets } from "../src/lib/doctor"
import { parseArgs, resolveVault, publishOutput, starterConfig, run, inPackage, PACKAGE_ROOT, CliError, USAGE } from "../src/cli"
import { resolveConfig } from "../src/site.config"

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-cli-"))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe("parseArgs", () => {
  test("command, vault and options", () => {
    expect(parseArgs(["build", "~/Notes", "--out", "site", "--site", "https://x.example"])).toEqual({
      command: "build",
      vault: "~/Notes",
      out: "site",
      site: "https://x.example",
      port: undefined,
      host: undefined,
      strict: undefined,
      verbose: undefined,
      fresh: undefined,
    })
    expect(parseArgs(["check", "--strict", "--verbose"])).toMatchObject({
      command: "check",
      strict: true,
      verbose: true,
    })
    expect(parseArgs(["dev", "-p", "8080", "--host"])).toMatchObject({
      command: "dev",
      port: 8080,
      host: true,
    })
  })

  test("help and version", () => {
    expect(parseArgs([]).command).toBe("help")
    expect(parseArgs(["build", "--help"]).command).toBe("help")
    expect(parseArgs(["-v"]).command).toBe("version")
  })

  test("mistakes are reported, not ignored", () => {
    expect(() => parseArgs(["publish"])).toThrow(CliError)
    expect(() => parseArgs(["build", "a", "b"])).toThrow("Unexpected argument")
    expect(() => parseArgs(["dev", "--port", "http"])).toThrow("Invalid port")
    expect(() => parseArgs(["dev", "--nope"])).toThrow(CliError)
  })

  test("url takes a note, and check a --json switch", () => {
    expect(parseArgs(["url", "Books/Dune.md", "~/Notes", "--lang", "vi-VN"])).toMatchObject({
      command: "url",
      note: "Books/Dune.md",
      vault: "~/Notes",
      lang: "vi-VN",
    })
    expect(() => parseArgs(["url"])).toThrow("Missing note")
    expect(parseArgs(["check", "--json"]).json).toBe(true)
  })

  test("the usage lists every command", () => {
    for (const c of ["dev", "build", "preview", "check", "init", "deploy", "export", "url"]) expect(USAGE).toContain(`datme ${c}`)
  })
})

describe("resolveVault", () => {
  test("argument first, then DATME_VAULT, then the working directory; empty variables count as unset", () => {
    fs.mkdirSync(path.join(tmp, "v"), { recursive: true })
    expect(resolveVault("v", {}, tmp)).toBe(path.join(tmp, "v"))
    expect(resolveVault(undefined, { DATME_VAULT: path.join(tmp, "v") }, "/")).toBe(path.join(tmp, "v"))
    expect(resolveVault(undefined, {}, tmp)).toBe(tmp)
    expect(resolveVault(undefined, { DATME_VAULT: "", VAULT_PATH: "" }, tmp)).toBe(tmp)
  })

  test("a missing vault is an error", () => {
    expect(() => resolveVault("missing", {}, tmp)).toThrow("is not a directory")
  })
})

describe("inPackage", () => {
  test("runs in the package root and restores the working directory", async () => {
    const before = process.cwd()
    expect(await inPackage(async () => process.cwd())).toBe(fs.realpathSync(PACKAGE_ROOT))
    expect(process.cwd()).toBe(before)
  })

  test("restores the working directory when the build fails", async () => {
    const before = process.cwd()
    await expect(inPackage(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom")
    expect(process.cwd()).toBe(before)
  })
})

describe("publishOutput", () => {
  const staging = path.join(tmp, "staging")
  fs.mkdirSync(staging, { recursive: true })
  fs.writeFileSync(path.join(staging, "index.html"), "<p>new</p>")

  test("creates the output and marks it as datme's", () => {
    const out = path.join(tmp, "out")
    publishOutput(staging, out, path.join(tmp, "v"))
    expect(fs.readFileSync(path.join(out, "index.html"), "utf8")).toBe("<p>new</p>")
    expect(fs.existsSync(path.join(out, ".datme-build"))).toBe(true)
  })

  test("replaces a previous build, dropping stale files", () => {
    const out = path.join(tmp, "out")
    fs.writeFileSync(path.join(out, "stale.html"), "")
    publishOutput(staging, out, path.join(tmp, "v"))
    expect(fs.existsSync(path.join(out, "stale.html"))).toBe(false)
  })

  test("never deletes a directory it did not create", () => {
    const precious = path.join(tmp, "precious")
    fs.mkdirSync(precious)
    fs.writeFileSync(path.join(precious, "thesis.md"), "keep me")
    expect(() => publishOutput(staging, precious, path.join(tmp, "v"))).toThrow("not created by datme")
    expect(fs.readFileSync(path.join(precious, "thesis.md"), "utf8")).toBe("keep me")
  })

  test("refuses the vault, home and filesystem root", () => {
    const vault = path.join(tmp, "v")
    expect(() => publishOutput(staging, vault, vault)).toThrow("Refusing")
    expect(() => publishOutput(staging, os.homedir(), vault)).toThrow("Refusing")
    expect(() => publishOutput(staging, "/", vault)).toThrow("Refusing")
  })

  test("keeps the previous build when the new one cannot be copied", () => {
    const out = path.join(tmp, "kept")
    publishOutput(staging, out, path.join(tmp, "v"))
    expect(() => publishOutput(path.join(tmp, "no-staging"), out, path.join(tmp, "v"))).toThrow()
    expect(fs.readFileSync(path.join(out, "index.html"), "utf8")).toBe("<p>new</p>")
    // No half-copied directory is left next to it.
    expect(fs.readdirSync(tmp).filter((f) => f.includes("kept"))).toEqual(["kept"])
  })
})

describe("build", () => {
  const vaultOf = (name: string) => {
    const vault = path.join(tmp, name)
    fs.mkdirSync(vault, { recursive: true })
    fs.writeFileSync(path.join(vault, `${name}.md`), `---\npublish: true\n---\nThe ${name} note.\n`)
    return vault
  }

  test("refuses an --out it may not replace before building anything", async () => {
    const precious = path.join(tmp, "precious-early")
    fs.mkdirSync(precious)
    fs.writeFileSync(path.join(precious, "thesis.md"), "keep me")
    const started = Date.now()
    const failed = await run({ command: "build", out: precious }, { ...process.env, DATME_CACHE: "" }, tmp).catch((e: Error) => e)
    expect((failed as Error).message).toContain("not created by datme")
    // A build takes far longer; the refusal comes first.
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(fs.readFileSync(path.join(precious, "thesis.md"), "utf8")).toBe("keep me")
  }, 60_000)

  test("two builds at once each publish their own site", async () => {
    const build = (name: string) =>
      Bun.spawn(["bun", "bin/datme.ts", "build", vaultOf(name), "--out", path.join(tmp, `${name}-site`)], {
        cwd: PACKAGE_ROOT,
        env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
        stdout: "pipe",
        stderr: "pipe",
      })
    const procs = [build("alpha"), build("beta")]
    const codes = await Promise.all(procs.map((p) => p.exited))
    expect(codes).toEqual([0, 0])
    for (const [name, other] of [
      ["alpha", "beta"],
      ["beta", "alpha"],
    ]) {
      const site = path.join(tmp, `${name}-site`)
      expect(fs.existsSync(path.join(site, name, "index.html"))).toBe(true)
      expect(fs.existsSync(path.join(site, other, "index.html"))).toBe(false)
    }
    // Each build cleans up the directory it staged in.
    const staged = fs.existsSync(path.join(PACKAGE_ROOT, ".datme")) ? fs.readdirSync(path.join(PACKAGE_ROOT, ".datme")) : []
    for (const p of procs) expect(staged).not.toContain(`dist-${p.pid}`)
  }, 120_000)
})

describe("export", () => {
  test('"./" is named after the vault, not "."', async () => {
    const dir = path.join(tmp, "export-cwd")
    fs.mkdirSync(dir)
    await run({ command: "export", folder: "./", format: "html" }, { ...process.env }, dir)
    expect(fs.readdirSync(dir)).toEqual(["vault.html"])
  }, 60_000)
})

describe("url and check --json", () => {
  const fixture = path.resolve(import.meta.dir, "fixtures/vault")
  const cli = (...args: string[]) =>
    Bun.spawnSync(["bun", "bin/datme.ts", ...args], {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, DATME_VAULT: "", VAULT_PATH: "" },
      stdout: "pipe",
      stderr: "pipe",
    })

  test("url prints the path of a published note or doc, and fails on a private one", () => {
    expect(cli("url", "07_Project/Blog post.md", fixture).stdout.toString().trim()).toBe("/07_Project/Blog-post")
    expect(cli("url", "07_Project/Map.canvas", fixture, "--lang", "en-US").stdout.toString().trim()).toBe("/en-US/07_Project/Map.canvas")
    const hidden = cli("url", "06_Reference/Private.md", fixture)
    expect(hidden.exitCode).toBe(1)
    expect(hidden.stderr.toString()).toContain("is not published")
  }, 60_000)

  test("check --json lists every problem with its counts", () => {
    const out = JSON.parse(cli("check", fixture, "--json").stdout.toString())
    expect(out.counts.error).toBeGreaterThan(0)
    expect(out.problems.some((p: { level: string }) => p.level === "info")).toBe(true)
  }, 60_000)
})

describe("init", () => {
  test("the starter config is valid and named after the vault", () => {
    const c = resolveConfig(loadYaml(starterConfig("/home/me/Second Brain")), "/home/me/Second Brain")
    expect(c.title["en-US"]).toBe("Second Brain")
    expect(c.publish).toBe("explicit")
    expect(c.appearance.style).toBe("notebook")
    expect(c.appearance.folders).toEqual({})
  })

  test("writes datme.yaml once and never overwrites it", async () => {
    const vault = path.join(tmp, "init-vault")
    fs.mkdirSync(vault)
    await run({ command: "init", vault }, {}, tmp)
    expect(fs.readFileSync(path.join(vault, "datme.yaml"), "utf8")).toContain("languages: [en-US]")
    const again = await run({ command: "init", vault }, {}, tmp).catch((e: Error) => e)
    expect((again as Error).message).toContain("already exists")
  })
})

describe("runtimes", () => {
  // Node strips TypeScript types natively from 22.18 and 23.6 on: the engines of package.json.
  const node = Bun.which("node")
  const version = node ? Bun.spawnSync([node, "--version"]).stdout.toString().trim() : ""
  const modernNode = !!version && meets(version, JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, "../package.json"), "utf8")).engines.node)

  test.skipIf(!modernNode)("the CLI runs on Node as well as Bun", () => {
    const root = path.resolve(import.meta.dir, "..")
    const out = Bun.spawnSync([node!, "bin/datme.ts", "--version"], {
      cwd: root,
    })
    expect(out.exitCode).toBe(0)
    expect(out.stdout.toString().trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe("packaging", () => {
  test("the published bin is plain JavaScript, built before packing", () => {
    // Node refuses to strip TypeScript types inside node_modules.
    const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, "../package.json"), "utf8"))
    expect(pkg.bin.datme).toBe("bin/datme.js")
    expect(pkg.scripts.prepack).toContain("bin/datme.ts")
    expect(pkg.files).toContain("LICENSE")
    // A scoped package is private on npm unless published as public.
    expect(pkg.name).toBe("@dynamotn/datme")
    expect(pkg.publishConfig.access).toBe("public")
  })
})
