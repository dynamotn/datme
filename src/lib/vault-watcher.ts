import type { AstroIntegration } from "astro"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { site } from "../site.config"
import { redirectsFile } from "./routes"
import { headersFile, inlineScriptHashes } from "./headers"
import { ACTOR_PATH, OUTBOX_PATH, actor, outbox, webfinger } from "./activitypub"
import { listed, byRecent, isIgnored } from "./vault"
import { renderNote } from "./markdown"
import { keepRequestUrl } from "./dev-look"

/**
 * The path of a file relative to the vault, with "/" separators so Windows
 * paths match too; undefined outside it, a sibling folder sharing its name included.
 */
function inVault(file: string): string | undefined {
  const vault = site.vault.replace(/\\/g, "/").replace(/\/+$/, "")
  const p = file.replace(/\\/g, "/")
  return p.startsWith(vault + "/") ? p.slice(vault.length + 1) : undefined
}

/**
 * Whether the dev watcher leaves a file out: one in a folder datme ignores, or
 * a dotfile such as .git, inside the vault.
 */
export function ignoredInVault(file: string): boolean {
  const rel = inVault(file)
  if (rel === undefined) return false
  return rel.split("/").some((segment) => segment.startsWith(".")) || isIgnored(rel)
}

/** Every HTML file under a directory, as text. */
function htmlFiles(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith(".html")).map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
}

/**
 * datme's Astro integration: in dev it rebuilds the vault index whenever a note
 * changes and reloads the browser; after a build it writes the CNAME file.
 */
export default function vaultWatcher(): AstroIntegration {
  return {
    name: "datme",
    hooks: {
      // Vite adds its own rules, such as node_modules, to these.
      "astro:config:setup": ({ updateConfig }) => void updateConfig({ vite: { server: { watch: { ignored: [ignoredInVault] } } } }),
      "astro:build:done": async ({ dir }) => {
        // The output folder as a path: a URL's pathname is percent-encoded, and on Windows starts with /C:.
        const out = fileURLToPath(dir)
        if (site.cname && site.url) fs.writeFileSync(new URL("CNAME", dir), new URL(site.url).host + "\n")
        if (site.redirects) {
          const lines = redirectsFile()
          if (lines) fs.writeFileSync(new URL("_redirects", dir), lines)
        }
        const ap = site.activitypub
        if (ap && ap !== "bridgy" && site.url) {
          // The static parts of an actor: found from Mastodon, read, not followed.
          const write = (p: string, data: object) => {
            const file = path.join(out, p)
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file, JSON.stringify(data))
          }
          const notes = byRecent(
            listed(site.defaultLang).filter((n) => !n.isHome && !n.protected && n.created),
            "created",
          ).slice(0, 20)
          const items = await Promise.all(
            notes.map(async (n) => ({ url: n.url, title: n.title, summary: (await renderNote(n)).description ?? "", published: n.created!, tags: n.tags })),
          )
          write(".well-known/webfinger", webfinger(site, ap.username))
          write(ACTOR_PATH, actor(site, ap.username))
          write(OUTBOX_PATH, outbox(site, items))
        }
        if (site.search.engine === "pagefind") {
          // Notes mark their body for Pagefind; every other page is left out of the index.
          const pagefind = await import("pagefind")
          const { index } = await pagefind.createIndex({})
          if (!index) throw new Error("Pagefind could not start")
          await index.addDirectory({ path: out })
          await index.writeFiles({ outputPath: path.join(out, "pagefind") })
          await pagefind.close()
        }
        if (site.headers) {
          // The CSP allows the inline scripts the pages actually hold, by hash.
          const hashes = site.headers.csp ? inlineScriptHashes(htmlFiles(out)) : []
          fs.writeFileSync(new URL("_headers", dir), headersFile(site, hashes))
        }
      },
      "astro:server:setup": ({ server }) => {
        // The style switcher reads its preview from the query, which Astro hides from prerendered pages.
        server.middlewares.use(keepRequestUrl)
        // The whole vault, so a folder made after start is seen too; ignoredInVault keeps .git and ignored trees out.
        server.watcher.add(site.vault)
        const onChange = (file: string) => {
          if (inVault(file) === undefined || ignoredInVault(file)) return
          const g = globalThis as { __vaultVersion?: number }
          g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
          // Astro keeps each page's props from getStaticPaths, the note itself included, until its
          // server hears of a content change: without this the reload would show the old note.
          server.environments.ssr.hot.send("astro:content-changed", {})
          server.hot.send({ type: "full-reload" })
        }
        server.watcher.on("change", onChange)
        server.watcher.on("add", onChange)
        server.watcher.on("unlink", onChange)
      },
    },
  }
}
