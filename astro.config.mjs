// @ts-check
import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import vaultWatcher from "./src/lib/vault-watcher.ts"

export default defineConfig({
  site: "https://notes.dynamotn.dev",
  trailingSlash: "ignore",
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  integrations: [sitemap(), vaultWatcher()],
})
