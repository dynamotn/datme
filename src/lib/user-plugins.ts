import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { PluggableList } from "unified"

/**
 * Remark and rehype plugins of the vault's own `datme.config.mjs`, for syntax
 * datme does not know. The file runs as code, like any build script: it
 * belongs to the vault's owner.
 *
 *   export default { remarkPlugins: [remarkFoo], rehypePlugins: [[rehypeBar, { option: 1 }]] }
 */
export const PLUGIN_FILES = ["datme.config.mjs", "datme.config.js"]

export interface UserPlugins {
  remark: PluggableList
  rehype: PluggableList
  /** Changes whenever the file does, to key cached pages. */
  signature: string
}

export const NO_PLUGINS: UserPlugins = { remark: [], rehype: [], signature: "" }

export function pluginFile(vault: string): string | undefined {
  return PLUGIN_FILES.map((f) => path.join(vault, f)).find((f) => fs.existsSync(f))
}

export async function loadUserPlugins(vault: string): Promise<UserPlugins> {
  const file = pluginFile(vault)
  if (!file) return NO_PLUGINS
  const source = fs.readFileSync(file)
  let mod: { default?: unknown; remarkPlugins?: unknown; rehypePlugins?: unknown }
  try {
    // The query makes a changed file load again in `datme dev`.
    const url = `${pathToFileURL(file).href}?v=${crypto.createHash("sha1").update(source).digest("hex").slice(0, 8)}`
    mod = await import(/* @vite-ignore */ url)
  } catch (e) {
    throw new Error(`Cannot load ${file}: ${(e as Error).message}`)
  }
  const config = (mod.default ?? mod) as { remarkPlugins?: unknown; rehypePlugins?: unknown }
  const list = (v: unknown, name: string): PluggableList => {
    if (v == null) return []
    if (!Array.isArray(v)) throw new Error(`${file}: ${name} must be a list of plugins`)
    for (const p of v) {
      const fn = Array.isArray(p) ? p[0] : p
      if (typeof fn !== "function") throw new Error(`${file}: every entry of ${name} must be a plugin function or [plugin, options]`)
    }
    return v as PluggableList
  }
  return {
    remark: list(config.remarkPlugins, "remarkPlugins"),
    rehype: list(config.rehypePlugins, "rehypePlugins"),
    signature: crypto.createHash("sha256").update(source).digest("hex"),
  }
}
