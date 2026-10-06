// @ts-check
import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import vaultWatcher from "./src/lib/vault-watcher.ts"
import { site } from "./src/site.config.ts"

export default defineConfig({
  site: site.url,
  trailingSlash: "ignore",
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  // A sitemap needs absolute URLs, so it is only built when site.url is set.
  integrations: [...(site.url ? [sitemap()] : []), vaultWatcher()],
})
