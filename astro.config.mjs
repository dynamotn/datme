// @ts-check
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import vaultWatcher from "./src/lib/vault-watcher.ts"
import { site } from "./src/site.config.ts"
import { indexable } from "./src/lib/sitemap.ts"
import { fsAllow } from "./src/lib/fs-allow.ts"

let outDir = ""
// Astro's caches live in the work folder the CLI sets, since the package may be read-only.
const work = process.env.DATME_WORK
const cacheDir = work ? path.join(work, "cache") : undefined

export default defineConfig({
  site: site.url,
  // A site.url with a path (project Pages, https://user.github.io/repo/) serves every page under it.
  base: site.base,
  trailingSlash: "ignore",
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  // Pages wait on async work (OG cards, image probes), so a few render at once.
  build: { concurrency: Math.max(1, Math.min(8, os.availableParallelism())) },
  // The graph's layout worker is a module: it loads the flat or the 3D layout only when needed.
  // Astro's root is a work folder that links to the package: ids keep the links, so every file is found under the root.
  vite: { worker: { format: "es" }, cacheDir, resolve: { preserveSymlinks: Boolean(work) }, server: work ? { fs: { allow: fsAllow(work) } } : {} },
  cacheDir,
  // A sitemap needs absolute URLs, so it is only built when site.url is set.
  integrations: [
    { name: "datme:out-dir", hooks: { "astro:config:done": ({ config }) => void (outDir = fileURLToPath(config.outDir)) } },
    ...(site.url ? [sitemap({ filter: (page) => indexable(page, outDir) })] : []),
    vaultWatcher(),
  ],
})
