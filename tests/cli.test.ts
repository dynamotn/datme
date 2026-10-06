import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { load as loadYaml } from "js-yaml"
import { parseArgs, resolveVault, publishOutput, starterConfig, run, CliError, USAGE } from "../src/cli"
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
    })
    expect(parseArgs(["dev", "-p", "8080", "--host"])).toMatchObject({ command: "dev", port: 8080, host: true })
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

  test("the usage lists every command", () => {
    for (const c of ["dev", "build", "preview", "init"]) expect(USAGE).toContain(`datme ${c}`)
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
})

describe("init", () => {
  test("the starter config is valid and named after the vault", () => {
    const c = resolveConfig(loadYaml(starterConfig("/home/me/Second Brain")), "/home/me/Second Brain")
    expect(c.title["en-US"]).toBe("Second Brain")
    expect(c.publish).toBe("explicit")
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
