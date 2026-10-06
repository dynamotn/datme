import type { AstroIntegration } from "astro"
import fs from "node:fs"
import path from "node:path"
import { site } from "../site.config"
import { redirectsFile } from "./routes"
import { headersFile, inlineScriptHashes } from "./headers"

/** Every HTML file under a directory, as text. */
function htmlFiles(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".html"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
}

/**
 * datme's Astro integration: in dev it rebuilds the vault index whenever a note
 * changes and reloads the browser; after a build it writes the CNAME file.
 */
export default function vaultWatcher(): AstroIntegration {
  return {
    name: "datme",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        if (site.cname && site.url) fs.writeFileSync(new URL("CNAME", dir), new URL(site.url).host + "\n")
        if (site.redirects) {
          const lines = redirectsFile()
          if (lines) fs.writeFileSync(new URL("_redirects", dir), lines)
        }
        if (site.search.engine === "pagefind") {
          // Notes mark their body for Pagefind; every other page is left out of the index.
          const pagefind = await import("pagefind")
          const { index } = await pagefind.createIndex({})
          if (!index) throw new Error("Pagefind could not start")
          await index.addDirectory({ path: dir.pathname })
          await index.writeFiles({ outputPath: path.join(dir.pathname, "pagefind") })
          await pagefind.close()
        }
        if (site.headers) {
          // The CSP allows the inline scripts the pages actually hold, by hash.
          const hashes = site.headers.csp ? inlineScriptHashes(htmlFiles(dir.pathname)) : []
          fs.writeFileSync(new URL("_headers", dir), headersFile(site, hashes))
        }
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
