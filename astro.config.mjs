// @ts-check
import os from "node:os"
import { fileURLToPath } from "node:url"
import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import vaultWatcher from "./src/lib/vault-watcher.ts"
import { site } from "./src/site.config.ts"
import { indexable } from "./src/lib/sitemap.ts"

let outDir = ""

export default defineConfig({
  site: site.url,
  // A site.url with a path (project Pages, https://user.github.io/repo/) serves every page under it.
  base: site.base,
  trailingSlash: "ignore",
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  // Pages wait on async work (OG cards, image probes), so a few render at once.
  build: { concurrency: Math.max(1, Math.min(8, os.availableParallelism())) },
  // The graph's layout worker is a module: it loads the flat or the 3D layout only when needed.
  vite: { worker: { format: "es" } },
  // A sitemap needs absolute URLs, so it is only built when site.url is set.
  integrations: [
    { name: "datme:out-dir", hooks: { "astro:config:done": ({ config }) => void (outDir = fileURLToPath(config.outDir)) } },
    ...(site.url ? [sitemap({ filter: (page) => indexable(page, outDir) })] : []),
    vaultWatcher(),
  ],
})
