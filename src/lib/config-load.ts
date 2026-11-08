/** Reads the config of a vault, without touching the site the rest of datme uses. */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseYaml } from "./yaml"
import { CONFIG_FILES } from "./config-files"
import { ConfigError, resolveConfig, type SiteConfig } from "./config-resolve"

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p
}

/** Find and parse the config file of a vault; a vault without one gets the defaults. */
export function loadConfig(vault: string, env: Record<string, string | undefined> = process.env): SiteConfig {
  for (const name of CONFIG_FILES) {
    const file = path.join(vault, name)
    if (!fs.existsSync(file)) continue
    let raw: unknown
    try {
      raw = parseYaml(fs.readFileSync(file, "utf8")) ?? {}
    } catch (e) {
      throw new ConfigError(`Cannot parse ${file}: ${(e as Error).message}`)
    }
    return resolveConfig(raw, vault, env)
  }
  return resolveConfig({}, vault, env)
}

/** The vault to publish: DATME_VAULT (set by the CLI), VAULT_PATH, or the working directory. */
export function vaultFromEnv(env: Record<string, string | undefined> = process.env): string {
  return path.resolve(expandHome(env.DATME_VAULT || env.VAULT_PATH || process.cwd()))
}
