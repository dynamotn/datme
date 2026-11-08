import { CONFIG_FILES } from "./lib/config-files"
import { useSite } from "./lib/base"
import { loadConfig, vaultFromEnv } from "./lib/config-load"
import type { SiteConfig } from "./lib/config-resolve"

export * from "./lib/config-schema"
export * from "./lib/config-resolve"
export * from "./lib/config-load"

/** Config file names looked up at the root of the vault, in order. */
export { CONFIG_FILES }

export const site: SiteConfig = loadConfig(vaultFromEnv())
useSite(site)

/**
 * What every copy of this module in the process shares: Astro's config and its
 * pages each load one, so a reload in `datme dev` must reach them all.
 */
const live = ((globalThis as { [k: symbol]: unknown })[Symbol.for("datme.site")] ??= {
  sites: new Set<SiteConfig>(),
  listeners: new Set<() => void>(),
  url: site.url,
}) as { sites: Set<SiteConfig>; listeners: Set<() => void>; url?: string; problem?: string }
live.sites.add(site)

/** Runs after each reload of the config, to drop what was worked out from the old one. */
export function onSiteReload(listener: () => void): void {
  live.listeners.add(listener)
}

/** Why the last reload of the config failed, or what of it needs a restart; shown in the 🎨 bar. */
export function configProblem(): string | undefined {
  return live.problem
}

/**
 * Reads the config of the vault again into `site`, in place, for `datme dev`.
 * A config that fails keeps the one before; the problem is returned and kept for the 🎨 bar.
 */
export function reloadSite(vault = site.vault): string | undefined {
  let next: SiteConfig
  try {
    next = loadConfig(vault)
  } catch (e) {
    return (live.problem = `${(e as Error).message}\nThe previous config stays in use until this is fixed.`)
  }
  // Astro serves the site under the base it started with.
  live.problem = next.url !== live.url ? `site.url changed: restart datme dev to serve the site at its new address.` : undefined
  for (const s of live.sites) {
    for (const k of Object.keys(s)) delete (s as Record<string, unknown>)[k]
    Object.assign(s, next)
  }
  for (const listener of live.listeners) listener()
  return live.problem
}
