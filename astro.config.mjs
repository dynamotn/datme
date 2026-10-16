// @ts-check
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import vaultWatcher from "./src/lib/vault-watcher.ts"
import { site } from "./src/site.config.ts"

let outDir = ""
/**
 * Pages kept out of search engines (unlisted and draft notes, alias redirects, history) stay out of the sitemap.
 * @param {string} page
 */
function indexable(page) {
  try {
    const file = path.join(outDir, decodeURIComponent(new URL(page).pathname), "index.html")
    return !fs.readFileSync(file, "utf8").includes('<meta name="robots" content="noindex"')
  } catch {
    return true
  }
}

export default defineConfig({
  site: site.url,
  trailingSlash: "ignore",
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  // A sitemap needs absolute URLs, so it is only built when site.url is set.
  integrations: [
    { name: "datme:out-dir", hooks: { "astro:config:done": ({ config }) => void (outDir = fileURLToPath(config.outDir)) } },
    ...(site.url ? [sitemap({ filter: indexable })] : []),
    vaultWatcher(),
  ],
})
