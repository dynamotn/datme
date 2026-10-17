import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as childProcess from "node:child_process"
import * as astro from "astro"
import { parseArgs, run, pruneCache, claimCache, deploy, PACKAGE_ROOT, CliError, type Args } from "../src/cli"
import { site, type SiteConfig } from "../src/site.config"
import * as mcp from "../src/lib/mcp"
import * as doctor from "../src/lib/doctor"
import * as check from "../src/lib/check"
import { DEAD_LINKS_FILE } from "../src/lib/dead-links"
import { NEIGHBOURS_FILE } from "../src/lib/neighbours"

const fixture = path.resolve(import.meta.dir, "fixtures/vault")
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "datme-cov-cli-")))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

/** Change some settings for the length of a test; restored after each one. */
const saved: Partial<SiteConfig>[] = []
function setSite(patch: Partial<SiteConfig>): void {
  saved.push(Object.fromEntries(Object.keys(patch).map((k) => [k, site[k as keyof SiteConfig]])) as Partial<SiteConfig>)
  Object.assign(site, patch)
}

/** What the CLI prints, captured instead of shown. */
let log: Mock<typeof console.log>
let warn: Mock<typeof console.warn>
const printed = () => log.mock.calls.map((c) => c.join(" ")).join("\n")
const warned = () => warn.mock.calls.map((c) => c.join(" ")).join("\n")
beforeEach(() => {
  log = spyOn(console, "log").mockImplementation(() => {})
  warn = spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  log.mockRestore()
  warn.mockRestore()
  while (saved.length) Object.assign(site, saved.pop())
})

const dir = (name: string) => {
  const d = path.join(tmp, name)
  fs.mkdirSync(d, { recursive: true })
  return d
}
const failure = (p: Promise<unknown>) => p.then(() => undefined, (e: Error) => e)

describe("parseArgs, every command", () => {
  test("deploy takes a known host and a branch", () => {
    expect(parseArgs(["deploy", "gitlab", "~/Notes", "-b", "pages"])).toMatchObject({ command: "deploy", target: "gitlab", branch: "pages", vault: "~/Notes" })
    expect(() => parseArgs(["deploy"])).toThrow("Missing host; choose one of github, gitlab, netlify, cloudflare.")
    expect(() => parseArgs(["deploy", "heroku"])).toThrow('Unknown host "heroku"')
  })

  test("export takes a folder and a format, epub by default", () => {
    expect(parseArgs(["export", "Books", "--lang", "vi-VN"])).toMatchObject({ command: "export", folder: "Books", format: "epub", lang: "vi-VN" })
    expect(parseArgs(["export", ".", "-f", "html"]).format).toBe("html")
    expect(() => parseArgs(["export"])).toThrow("Missing folder to export")
    expect(() => parseArgs(["export", "Books", "--format", "pdf"])).toThrow('Unknown format "pdf"')
  })

  test("migrate takes a publisher and --write", () => {
    expect(parseArgs(["migrate", "quartz"])).toMatchObject({ command: "migrate", from: "quartz", write: false })
    expect(parseArgs(["migrate", "publish", "--write"]).write).toBe(true)
    expect(() => parseArgs(["migrate"])).toThrow("Missing publisher")
    expect(() => parseArgs(["migrate", "jekyll"])).toThrow('Unknown publisher "jekyll"')
  })

  test("related takes a note; --privacy only means something to check", () => {
    expect(parseArgs(["related", "A.md", "--json"])).toMatchObject({ command: "related", note: "A.md", json: true })
    expect(() => parseArgs(["related"])).toThrow("Missing note")
    expect(parseArgs(["check", "--privacy"]).privacy).toBe(true)
    expect(parseArgs(["build", "--privacy"])).not.toHaveProperty("privacy")
    expect(parseArgs(["build", "--drafts", "--fresh"])).toMatchObject({ drafts: true, fresh: true })
    expect(parseArgs(["check", "--external"]).external).toBe(true)
    expect(parseArgs(["mcp"]).command).toBe("mcp")
    expect(() => parseArgs(["dev", "--port", "70000"])).toThrow("Invalid port")
  })
})

describe("the build cache", () => {
  test("pruning deletes what the last build did not touch, and empty folders, but keeps datme's own files", () => {
    const root = dir("prune")
    const old = Date.now() - 60_000
    const files = {
      "notes/aa/stale": true,
      "notes/aa/fresh": false,
      "og/bb/stale": true,
      [DEAD_LINKS_FILE]: true,
      [NEIGHBOURS_FILE]: true,
      ".datme-cache": true,
    }
    for (const [rel, stale] of Object.entries(files)) {
      const f = path.join(root, rel)
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, "x")
      if (stale) fs.utimesSync(f, old / 1000, old / 1000)
    }
    pruneCache(root, Date.now() - 1000)
    expect(fs.existsSync(path.join(root, "notes/aa/stale"))).toBe(false)
    expect(fs.existsSync(path.join(root, "notes/aa/fresh"))).toBe(true)
    expect(fs.existsSync(path.join(root, "og"))).toBe(false)
    for (const keep of [DEAD_LINKS_FILE, NEIGHBOURS_FILE, ".datme-cache"]) expect(fs.existsSync(path.join(root, keep))).toBe(true)
  })

  test("pruning keeps going when another build prunes the same cache at the same time", () => {
    const root = dir("prune-race")
    const file = path.join(root, "og/7d/card")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, "x")
    fs.utimesSync(file, 1, 1)
    const rm = fs.rmSync.bind(fs)
    // The other build deletes the whole folder just as this one deletes the file in it.
    const race = spyOn(fs, "rmSync").mockImplementation(((p: string, opts?: fs.RmOptions) => {
      rm(p, opts)
      rm(path.dirname(p), { recursive: true, force: true })
    }) as typeof fs.rmSync)
    try {
      expect(() => pruneCache(root, Date.now())).not.toThrow()
    } finally {
      race.mockRestore()
    }
    expect(fs.existsSync(path.join(root, "og"))).toBe(false)
  })

  test("pruning still fails on errors other than an entry already gone", () => {
    const root = dir("prune-denied")
    const file = path.join(root, "og/card")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, "x")
    fs.utimesSync(file, 1, 1)
    const denied = spyOn(fs, "rmSync").mockImplementation((() => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })
    }) as typeof fs.rmSync)
    try {
      expect(() => pruneCache(root, Date.now())).toThrow("EACCES")
    } finally {
      denied.mockRestore()
    }
  })

  test("pruning a cache that does not exist does nothing", () => {
    expect(() => pruneCache(path.join(tmp, "no-cache"), Date.now())).not.toThrow()
  })

  test("a cache directory is claimed when empty or datme's, refused when it holds other files", () => {
    const fresh = path.join(tmp, "claim-new")
    claimCache(fresh)
    expect(fs.existsSync(path.join(fresh, ".datme-cache"))).toBe(true)
    const older = dir("claim-old")
    fs.mkdirSync(path.join(older, "notes"))
    claimCache(older)
    expect(fs.existsSync(path.join(older, ".datme-cache"))).toBe(true)
    const foreign = dir("claim-foreign")
    fs.writeFileSync(path.join(foreign, "thesis.md"), "keep me")
    expect(() => claimCache(foreign)).toThrow("is not empty and was not created by datme")
    expect(fs.readdirSync(foreign)).toEqual(["thesis.md"])
  })
})

describe("deploy", () => {
  test("outside git it warns, writes the CI files once and prints the next step", () => {
    const vault = dir("deploy-plain")
    deploy("netlify", vault)
    expect(warned()).toContain("is not a git repository yet")
    expect(fs.existsSync(path.join(vault, "netlify.toml"))).toBe(true)
    expect(printed()).toContain("import the repository in Netlify")
    expect(() => deploy("netlify", vault)).toThrow("already exists; remove it first")
  })

  test("inside a repository the files go to its root, for the current branch", async () => {
    const repo = dir("deploy-repo")
    Bun.spawnSync(["git", "init", "-q", "-b", "trunk", repo])
    const vault = dir("deploy-repo/notes")
    await run({ command: "deploy", target: "github", vault }, {}, tmp)
    expect(warned()).toBe("")
    const workflow = fs.readdirSync(path.join(repo, ".github/workflows")).map((f) => fs.readFileSync(path.join(repo, ".github/workflows", f), "utf8")).join("")
    expect(workflow).toContain("trunk")
    expect(workflow).toContain("notes")
  })
})

describe("run, commands that need no build", () => {
  test("help and version", async () => {
    await run({ command: "help" })
    expect(printed()).toContain("Usage:")
    await run({ command: "version" })
    expect(log.mock.calls.at(-1)![0]).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("migrate describes the changes, and applies them with --write", async () => {
    const vault = dir("migrate")
    fs.writeFileSync(path.join(vault, "Note.md"), "---\ndg-publish: true\n---\nHi.")
    await run({ command: "migrate", from: "digital-garden", vault }, {}, tmp)
    expect(printed()).toContain("Note.md: dg-publish → publish")
    expect(fs.readFileSync(path.join(vault, "Note.md"), "utf8")).toContain("dg-publish: true")
    await run({ command: "migrate", from: "digital-garden", vault, write: true }, {}, tmp)
    expect(fs.readFileSync(path.join(vault, "Note.md"), "utf8")).toBe("---\npublish: true\n---\nHi.")
  })

  test("export writes a folder as a page or a book, named after it", async () => {
    const env: Record<string, string> = {}
    await run({ command: "export", folder: "07_Project/", format: "html", vault: fixture }, env, tmp)
    expect(fs.readFileSync(path.join(tmp, "07_Project.html"), "utf8")).toContain("<html")
    expect(printed()).toContain(`Wrote ${path.join(tmp, "07_Project.html")}`)
    expect(env.DATME_VAULT).toBe(fixture)
    const out = path.join(tmp, "garden.epub")
    await run({ command: "export", folder: ".", format: "epub", vault: fixture, out, lang: "en-US", site: "https://x.example", drafts: true }, env, tmp)
    expect(fs.readFileSync(out).subarray(0, 2).toString()).toBe("PK")
    expect(env).toMatchObject({ DATME_SITE_URL: "https://x.example", DATME_DRAFTS: "1" })
  }, 120_000)

  test("export refuses an unknown language, a directory as output, and a folder without notes", async () => {
    const args: Args = { command: "export", folder: "07_Project", format: "html", vault: fixture }
    expect(await failure(run({ ...args, lang: "fr-FR" }, {}, tmp))).toBeInstanceOf(CliError)
    expect((await failure(run({ ...args, out: tmp }, {}, tmp)))?.message).toContain("is a directory")
    const e = await failure(run({ ...args, folder: "No such folder", out: path.join(tmp, "none.html") }, {}, tmp))
    expect(e).toBeInstanceOf(CliError)
  })

  test("output inside the vault is ignored by the next build", async () => {
    const env: Record<string, string> = {}
    await run({ command: "url", note: "07_Project/Talk.md", vault: fixture, out: path.join(fixture, "site") }, env, tmp)
    expect(env.DATME_IGNORE).toBe("site")
  })

  test("url prints the path of a note or doc, in a language", async () => {
    await run({ command: "url", note: "/07_Project/Talk.md", vault: fixture }, {}, tmp)
    await run({ command: "url", note: "07_Project\\Map.canvas", vault: fixture, lang: "en-US" }, {}, tmp)
    expect(printed()).toBe("/07_Project/Talk\n/en-US/07_Project/Map.canvas")
    expect((await failure(run({ command: "url", note: "07_Project/Nope.canvas", vault: fixture }, {}, tmp)))?.message).toContain("is not published")
    expect((await failure(run({ command: "url", note: "07_Project/Talk.md", vault: fixture, lang: "fr-FR" }, {}, tmp)))?.message).toContain(
      'Language "fr-FR" is not one of vi-VN, en-US',
    )
  })

  test("related lists suggestions, as text or JSON", async () => {
    await run({ command: "related", note: "03_Atomic/Zettelkasten.md", vault: fixture, json: true }, {}, tmp)
    expect(JSON.parse(log.mock.calls[0][0])).toBeObject()
    await run({ command: "related", note: "03_Atomic/Zettelkasten.md", vault: fixture }, {}, tmp)
    expect(typeof log.mock.calls[1][0]).toBe("string")
    expect((await failure(run({ command: "related", note: "Nope.md", vault: fixture }, {}, tmp)))?.message).toContain("is not a note of the vault")
    expect((await failure(run({ command: "related", note: "Nope.md", vault: fixture, lang: "xx" }, {}, tmp)))?.message).toContain('Language "xx"')
  }, 60_000)

  test("doctor checks the machine and the vault, and fails on what needs fixing", async () => {
    // Real git; the passwords of the locked notes are not in this environment.
    const first = await failure(run({ command: "doctor", vault: fixture }, {}, tmp))
    expect(first?.message).toBe("doctor found something to fix.")
    expect(printed()).toContain("DATME_LOCK_NOBODY is not set")
    expect(printed()).not.toContain("git is not installed")
    log.mockClear()
    // Semantic notes need a package, resolved by name; without git, dates come from the file system.
    setSite({ related: { ...site.related, semantic: { model: "m", threshold: 0.5 } } })
    const exec = spyOn(childProcess, "execFileSync").mockImplementation(() => {
      throw new Error("no git")
    })
    try {
      const e = await failure(run({ command: "doctor", vault: fixture }, {}, tmp))
      expect(e?.message).toBe("doctor found something to fix.")
      // Installed or not depends on the machine; either way the config asks for it.
      expect(printed()).toMatch(/@huggingface\/transformers is (not )?installed/)
      expect(printed()).toContain("git is not installed")
    } finally {
      exec.mockRestore()
    }
  })

  test("doctor with nothing to fix succeeds; a package that is not there does not resolve", async () => {
    let resolves: ((name: string) => boolean) | undefined
    const diagnose = spyOn(doctor, "diagnose").mockImplementation(((opts: { resolves(name: string): boolean }) => {
      resolves = opts.resolves
      return []
    }) as unknown as typeof doctor.diagnose)
    try {
      expect(await failure(run({ command: "doctor", vault: fixture }, {}, tmp))).toBeUndefined()
      expect(resolves!("astro")).toBe(true)
      expect(resolves!("datme-no-such-package")).toBe(false)
    } finally {
      diagnose.mockRestore()
    }
  })

  test("mcp serves the vault on stdio", async () => {
    const serve = spyOn(mcp, "serveStdio").mockResolvedValue(undefined)
    try {
      await run({ command: "mcp", vault: fixture }, {}, tmp)
      expect(serve).toHaveBeenCalledTimes(1)
    } finally {
      serve.mockRestore()
    }
  })
})

describe("run, check", () => {
  test("--privacy lists what leaves the vault, as text or JSON", async () => {
    await run({ command: "check", privacy: true, json: true, vault: fixture }, {}, tmp)
    expect(JSON.parse(log.mock.calls[0][0])).toBeObject()
    await run({ command: "check", privacy: true, vault: fixture }, {}, tmp)
    expect(log.mock.calls[1][0]).not.toStartWith("{")
  })

  test("problems fail the check, after printing them", async () => {
    const e = await failure(run({ command: "check", vault: fixture }, { DATME_CACHE: "" }, tmp))
    expect(e?.message).toMatch(/^check failed: /)
    expect(printed().length).toBeGreaterThan(0)
  }, 60_000)

  test("a vault without problems passes the check", async () => {
    const clean = spyOn(check, "checkVault").mockReturnValue([])
    try {
      expect(await failure(run({ command: "check", vault: fixture }, { DATME_CACHE: "" }, tmp))).toBeUndefined()
    } finally {
      clean.mockRestore()
    }
  })

  test("--external checks outside links and records the dead ones in the cache", async () => {
    const cache = path.join(tmp, "check-cache")
    const fetch = spyOn(globalThis, "fetch").mockImplementation((async () => new Response(null, { status: 404 })) as unknown as typeof globalThis.fetch)
    try {
      const e = await failure(run({ command: "check", external: true, json: true, vault: fixture }, { DATME_CACHE: cache }, tmp))
      expect(e).toBeInstanceOf(CliError)
      expect(printed()).toMatch(/Checking \d+ external links…/)
      expect(fs.existsSync(path.join(cache, ".datme-cache"))).toBe(true)
      expect(fs.readFileSync(path.join(cache, DEAD_LINKS_FILE), "utf8")).toContain("http")
      // Without a cache, nothing is recorded.
      const off = await failure(run({ command: "check", external: true, json: true, vault: fixture }, { DATME_CACHE: "" }, tmp))
      expect(off).toBeInstanceOf(CliError)
    } finally {
      fetch.mockRestore()
    }
  }, 60_000)

  test("neighbour gardens are fetched first, their last known notes kept when unreachable", async () => {
    setSite({ neighbours: { friend: "https://friend.invalid" } })
    const cache = path.join(tmp, "neighbours-cache")
    const env: Record<string, string> = { DATME_CACHE: cache }
    const fetch = spyOn(globalThis, "fetch").mockImplementation((async () => {
      throw new TypeError("offline")
    }) as unknown as typeof globalThis.fetch)
    try {
      await run({ command: "check", privacy: true, vault: fixture }, env, tmp)
    } finally {
      fetch.mockRestore()
    }
    expect(warned()).toContain("could not reach the gardens friend")
    expect(env.DATME_NEIGHBOURS).toBe(path.join(cache, NEIGHBOURS_FILE))
    expect(fs.existsSync(env.DATME_NEIGHBOURS)).toBe(true)
  })

  test("neighbours without a cache are kept next to the package", async () => {
    setSite({ neighbours: { friend: "https://friend.invalid" } })
    const env: Record<string, string> = { DATME_CACHE: "" }
    const fetch = spyOn(globalThis, "fetch").mockImplementation((async () => {
      throw new TypeError("offline")
    }) as unknown as typeof globalThis.fetch)
    const write = spyOn(fs, "writeFileSync").mockImplementation(() => {})
    const mkdir = spyOn(fs, "mkdirSync").mockImplementation(() => undefined)
    try {
      await run({ command: "check", privacy: true, vault: fixture }, env, tmp)
    } finally {
      fetch.mockRestore()
      write.mockRestore()
      mkdir.mockRestore()
    }
    expect(env.DATME_NEIGHBOURS).toBe(path.join(PACKAGE_ROOT, ".datme", NEIGHBOURS_FILE))
  })
})

describe("run, Astro commands", () => {
  // Astro itself is not run here: the build tests run it for real, out of process.
  // The fake build writes a page into this process's own staging directory, as Astro would.
  const staging = path.join(PACKAGE_ROOT, ".datme", `dist-${process.pid}`)
  let build: Mock<typeof astro.build>
  let dev: Mock<typeof astro.dev>
  let preview: Mock<typeof astro.preview>
  beforeEach(() => {
    build = spyOn(astro, "build").mockImplementation((async (config: { outDir: string }) => {
      fs.mkdirSync(config.outDir, { recursive: true })
      fs.writeFileSync(path.join(config.outDir, "index.html"), "<p>built</p>")
    }) as unknown as typeof astro.build)
    dev = spyOn(astro, "dev").mockResolvedValue({} as Awaited<ReturnType<typeof astro.dev>>)
    preview = spyOn(astro, "preview").mockResolvedValue({} as Awaited<ReturnType<typeof astro.preview>>)
  })
  afterEach(() => {
    build.mockRestore()
    dev.mockRestore()
    preview.mockRestore()
    fs.rmSync(staging, { recursive: true, force: true })
  })

  test("build --strict stops on problems before building", async () => {
    const e = await failure(run({ command: "build", strict: true, vault: fixture }, { DATME_CACHE: "" }, tmp))
    expect(e?.message).toContain("Build stopped by --strict.")
    expect(build).not.toHaveBeenCalled()
  }, 60_000)

  test("build reports problems, builds in the package, prunes the cache and publishes the site", async () => {
    const cache = dir("build-cache")
    fs.writeFileSync(path.join(cache, ".datme-cache"), "")
    fs.mkdirSync(path.join(cache, "notes"))
    fs.writeFileSync(path.join(cache, "notes", "old"), "x")
    fs.utimesSync(path.join(cache, "notes", "old"), 1, 1)
    const out = path.join(tmp, "site")
    const env: Record<string, string> = { DATME_CACHE: cache }
    await run({ command: "build", vault: fixture, out, verbose: true }, env, tmp)
    expect(warned()).toContain('run "datme check" for details')
    expect(build).toHaveBeenCalledWith({ root: PACKAGE_ROOT, outDir: staging })
    expect(env.DATME_CACHE).toBe(cache)
    expect(env.DATME_VERSION).toMatch(/^\d+\.\d+\.\d+/)
    expect(fs.existsSync(path.join(cache, "notes"))).toBe(false)
    expect(fs.readFileSync(path.join(out, "index.html"), "utf8")).toBe("<p>built</p>")
    expect(fs.existsSync(path.join(out, ".datme-build"))).toBe(true)
    expect(fs.existsSync(staging)).toBe(false)
    expect(printed()).toContain(`Site written to ${out}`)
    expect(printed()).toMatch(/cache/i)
  }, 60_000)

  test("a failed build leaves the previous site and drops the staging directory", async () => {
    const out = path.join(tmp, "site-kept")
    await run({ command: "build", vault: fixture, out }, { DATME_CACHE: "" }, tmp)
    build.mockImplementation((async (config: { outDir: string }) => {
      fs.mkdirSync(config.outDir, { recursive: true })
      throw new Error("astro broke")
    }) as unknown as typeof astro.build)
    expect((await failure(run({ command: "build", vault: fixture, out }, { DATME_CACHE: "" }, tmp)))?.message).toBe("astro broke")
    expect(fs.readFileSync(path.join(out, "index.html"), "utf8")).toBe("<p>built</p>")
    expect(fs.existsSync(staging)).toBe(false)
  }, 60_000)

  test("build --fresh empties the cache but keeps it datme's; an empty DATME_CACHE turns it off", async () => {
    const cache = dir("fresh-cache")
    fs.mkdirSync(path.join(cache, "og"))
    fs.writeFileSync(path.join(cache, "og", "card"), "x")
    await run({ command: "build", vault: fixture, out: path.join(tmp, "site-fresh"), fresh: true }, { DATME_CACHE: cache }, tmp)
    expect(fs.readdirSync(cache)).toEqual([".datme-cache"])
    const env: Record<string, string> = { DATME_CACHE: "" }
    await run({ command: "build", vault: fixture, out: path.join(tmp, "site-nocache") }, env, tmp)
    expect(env.DATME_VERSION).toBeUndefined()
    expect(build).toHaveBeenCalledTimes(2)
  }, 60_000)

  test("dev serves the vault live, preview builds then serves until the process ends", async () => {
    const env: Record<string, string> = { DATME_CACHE: "" }
    await run({ command: "dev", vault: fixture, port: 4400, host: true }, env, tmp)
    expect(env.DATME_DEV).toBe("1")
    expect(dev).toHaveBeenCalledWith({ root: PACKAGE_ROOT, server: { port: 4400, host: true } })
    expect(build).not.toHaveBeenCalled()
    const listeners = process.listeners("exit")
    await run({ command: "preview", vault: fixture, port: 4401 }, { DATME_CACHE: "" }, tmp)
    expect(build).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith({ root: PACKAGE_ROOT, outDir: staging, server: { port: 4401, host: undefined } })
    expect(fs.existsSync(path.join(staging, "index.html"))).toBe(true)
    // The staging directory is dropped when the process exits.
    const added = process.listeners("exit").filter((l) => !listeners.includes(l))
    expect(added).toHaveLength(1)
    process.removeListener("exit", added[0])
    added[0](0)
    expect(fs.existsSync(staging)).toBe(false)
  }, 60_000)
})

describe("bin/datme.ts", () => {
  // The bin runs on import; a query makes each import a fresh run. Bun's coverage keeps the
  // last run of the module only, so the last test goes through every line.
  let runs = 0
  const bin = async (...argv: string[]) => {
    const before = process.argv
    process.argv = ["bun", "datme", ...argv]
    try {
      return await import(`../bin/datme.ts?run=${++runs}`)
    } finally {
      process.argv = before
    }
  }

  test("runs the command line", async () => {
    await bin("--version")
    expect(log.mock.calls.at(-1)![0]).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("any other error is thrown as is", async () => {
    const vault = dir("read-only")
    fs.chmodSync(vault, 0o555)
    const exit = spyOn(process, "exit").mockImplementation((() => undefined) as unknown as typeof process.exit)
    try {
      const e = await failure(bin("init", vault))
      expect(e).toBeInstanceOf(Error)
      expect(e).not.toBeInstanceOf(CliError)
      expect((e as NodeJS.ErrnoException).code).toBe("EACCES")
      expect(exit).not.toHaveBeenCalled()
    } finally {
      exit.mockRestore()
      fs.chmodSync(vault, 0o755)
    }
  })

  test("a usage mistake prints one line and exits with 1", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {})
    // A real exit would end the test run; this one returns, and the bin then throws the error on.
    const exit = spyOn(process, "exit").mockImplementation((() => undefined) as unknown as typeof process.exit)
    try {
      expect(await failure(bin("publish"))).toBeInstanceOf(CliError)
      expect(error).toHaveBeenCalledWith('datme: Unknown command "publish". Run "datme --help".')
      expect(exit).toHaveBeenCalledWith(1)
    } finally {
      error.mockRestore()
      exit.mockRestore()
    }
  })
})
