import { afterAll, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import vaultWatcher, { ignoredInVault, isConfigFile } from "../src/lib/vault-watcher"
import { configProblem, onSiteReload, reloadSite, site } from "../src/site.config"
import { t } from "../src/lib/i18n"
import { keepRequestUrl } from "../src/lib/dev-look"

describe("dev watcher", () => {
  test("watches the vault itself, so a top-level folder made after start is seen", () => {
    const added: string[] = []
    const used: unknown[] = []
    const server = {
      watcher: { add: (p: string) => void added.push(p), on: () => {} },
      hot: { send: () => {} },
      middlewares: { use: (m: unknown) => void used.push(m) },
    }
    const hooks = vaultWatcher().hooks as Record<string, (o: unknown) => void>
    hooks["astro:server:setup"]({ server })
    expect(added).toEqual([site.vault])
    // The style switcher's preview needs each request's query, which Astro hides from prerendered pages.
    expect(used).toEqual([keepRequestUrl])
  })

  test("leaves out ignored folders and dotfiles, whatever the separator", () => {
    const at = (...p: string[]) => path.join(site.vault, ...p)
    expect(ignoredInVault(at(".git", "HEAD"))).toBe(true)
    expect(ignoredInVault(at(".obsidian"))).toBe(true)
    expect(ignoredInVault(at("Templates", "Daily.md"))).toBe(true)
    expect(ignoredInVault(at("Later", "New.md"))).toBe(false)
    expect(ignoredInVault(site.vault)).toBe(false)
    expect(ignoredInVault(path.dirname(site.vault))).toBe(false)
    // Windows paths, as the watcher reports them there.
    expect(ignoredInVault(site.vault.replace(/\//g, "\\") + "\\.git\\HEAD")).toBe(true)
    expect(ignoredInVault(site.vault.replace(/\//g, "\\") + "\\Later\\New.md")).toBe(false)
  })

  test("the ignore rule reaches the watcher through the Vite config", () => {
    let config: any
    const hooks = vaultWatcher().hooks as Record<string, (o: unknown) => void>
    hooks["astro:config:setup"]({ updateConfig: (c: unknown) => void (config = c) })
    expect(config.vite.server.watch.ignored).toContain(ignoredInVault)
  })

  test("keeps what the config reads: its files, .datme/ and the theme pack", () => {
    const at = (...p: string[]) => path.join(site.vault, ...p)
    for (const f of [at("datme.yaml"), at(".datme.yaml"), at(".datme"), at(".datme", "themes", "ink", "theme.yaml")]) {
      expect(isConfigFile(f)).toBe(true)
      expect(ignoredInVault(f)).toBe(false)
    }
    expect(isConfigFile(at("Later", "New.md"))).toBe(false)
    expect(isConfigFile(at(".git", "HEAD"))).toBe(false)
    expect(isConfigFile("/elsewhere/theme.yaml")).toBe(false)
  })
})

describe("dev watcher, the config", () => {
  const fixture = site.vault
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "datme-reload-")))
  const vault = path.join(tmp, "vault")
  const pack = path.join(vault, "ink")
  fs.mkdirSync(vault)
  fs.mkdirSync(pack)
  fs.writeFileSync(path.join(pack, "theme.yaml"), "style: garden\n")
  const write = (text: string) => fs.writeFileSync(path.join(vault, "datme.yaml"), text)
  write(`site: { title: Before, url: 'https://notes.dynamotn.dev' }\ntheme: { preset: ./ink }\n`)
  afterAll(() => {
    reloadSite(fixture)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  /** The dev server's watcher, as the integration sets it up, with what it sent the browser. */
  function serve() {
    const added: string[] = []
    const sent: unknown[] = []
    const handlers: Record<string, (file: string) => void> = {}
    const server = {
      watcher: { add: (p: string) => void added.push(p), on: (event: string, fn: (file: string) => void) => void (handlers[event] = fn) },
      hot: { send: (m: unknown) => void sent.push(m) },
      environments: { ssr: { hot: { send: (m: unknown) => void sent.push(m) } } },
      middlewares: { use: () => {} },
    }
    ;(vaultWatcher().hooks as Record<string, (o: unknown) => void>)["astro:server:setup"]({ server })
    return { added, sent, change: handlers.change }
  }

  test("an edit to datme.yaml is read again into the site, and the page reloads", () => {
    expect(reloadSite(vault)).toBeUndefined()
    expect(site.title["en-US"]).toBe("Before")
    const { added, sent, change } = serve()
    expect(added).toEqual([vault])
    // A theme pack in a folder of the vault is part of the config.
    expect(site.pack?.dir).toBe(pack)
    expect(isConfigFile(path.join(pack, "theme.css"))).toBe(true)
    let reloaded = 0
    onSiteReload(() => reloaded++)
    const log = spyOn(console, "log").mockImplementation(() => {})
    write("site: { title: After, url: 'https://notes.dynamotn.dev' }\nstrings: { en-US: { blog: Posts } }\n")
    expect(t("en-US").blog).not.toBe("Posts")
    change(path.join(vault, "datme.yaml"))
    expect(site.title["en-US"]).toBe("After")
    // What was worked out from the old config goes with it.
    expect(t("en-US").blog).toBe("Posts")
    expect(reloaded).toBe(1)
    expect(site.pack).toBeUndefined()
    expect(sent).toEqual(["astro:content-changed", { type: "full-reload" }])
    expect(log).toHaveBeenCalledWith("[datme] config reloaded")
    log.mockRestore()
  })

  test("a config that no longer loads keeps the one before, and says why", () => {
    reloadSite(vault)
    const { sent, change } = serve()
    const error = spyOn(console, "error").mockImplementation(() => {})
    const log = spyOn(console, "log").mockImplementation(() => {})
    write("site: { title: [unclosed\n")
    change(path.join(vault, "datme.yaml"))
    expect(site.title["en-US"]).toBe("After")
    expect(configProblem()).toContain("Cannot parse")
    expect(configProblem()).toContain("previous config stays in use")
    expect(error.mock.calls[0][0]).toContain("[datme] Cannot parse")
    // The page still reloads, to show the problem in the 🎨 bar.
    expect(sent).toEqual(["astro:content-changed", { type: "full-reload" }])
    write("site: { title: Fixed, url: 'https://notes.dynamotn.dev' }\n")
    change(path.join(vault, "datme.yaml"))
    expect(configProblem()).toBeUndefined()
    expect(site.title["en-US"]).toBe("Fixed")
    error.mockRestore()
    log.mockRestore()
  })

  test("a new site.url asks for a restart, which the base it is served under needs", () => {
    write("site: { url: https://elsewhere.example/garden }\n")
    expect(reloadSite(vault)).toContain("restart datme dev")
    expect(site.base).toBe("/garden/")
    write("site: { title: Fixed, url: 'https://notes.dynamotn.dev' }\n")
    reloadSite(vault)
  })
})
