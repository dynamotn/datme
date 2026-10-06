import type { AstroIntegration } from "astro"
import fs from "node:fs"
import path from "node:path"
import { site } from "../site.config"

/**
 * datme's Astro integration: in dev it rebuilds the vault index whenever a note
 * changes and reloads the browser; after a build it writes the CNAME file.
 */
export default function vaultWatcher(): AstroIntegration {
  return {
    name: "datme",
    hooks: {
      "astro:build:done": ({ dir }) => {
        if (site.cname && site.url) fs.writeFileSync(new URL("CNAME", dir), new URL(site.url).host + "\n")
      },
      "astro:server:setup": ({ server }) => {
        // Watch top-level entries one by one so .git and other ignored trees stay unwatched.
        for (const entry of fs.readdirSync(site.vault)) {
          if (!site.ignore.includes(entry)) server.watcher.add(path.join(site.vault, entry))
        }
        const onChange = (file: string) => {
          if (!file.startsWith(site.vault) || file.includes("/.git/")) return
          const g = globalThis as { __vaultVersion?: number }
          g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
          server.hot.send({ type: "full-reload" })
        }
        server.watcher.on("change", onChange)
        server.watcher.on("add", onChange)
        server.watcher.on("unlink", onChange)
      },
    },
  }
}
