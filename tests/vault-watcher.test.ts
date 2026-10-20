import { describe, expect, test } from "bun:test"
import path from "node:path"
import vaultWatcher, { ignoredInVault } from "../src/lib/vault-watcher"
import { site } from "../src/site.config"
import { keepRequestUrl } from "../src/lib/dev-look"

describe("dev watcher", () => {
  test("watches the vault itself, so a top-level folder made after start is seen", () => {
    const added: string[] = []
    const used: unknown[] = []
    const server = { watcher: { add: (p: string) => void added.push(p), on: () => {} }, hot: { send: () => {} }, middlewares: { use: (m: unknown) => void used.push(m) } }
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
})
