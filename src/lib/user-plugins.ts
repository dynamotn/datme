import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { PluggableList } from "unified"

/**
 * The vault's own `datme.config.mjs`: remark and rehype plugins for syntax
 * datme does not know, renderers for fenced code blocks, and tags for the
 * `<head>` of every page. The same fields can come bundled as plugins, so a
 * package can ship a whole feature:
 *
 *   import kroki from "datme-plugin-kroki"
 *   export default {
 *     remarkPlugins: [remarkFoo],
 *     rehypePlugins: [[rehypeBar, { option: 1 }]],
 *     codeBlocks: { greet: (source, { lang }) => `<p>Hello, ${source}</p>` },
 *     head: '<link rel="stylesheet" href="/assets/extra.css">',
 *     plugins: [kroki({ server: "https://kroki.io" })],
 *   }
 *
 * The file runs as code, like any build script: it belongs to the vault's owner.
 */
export const PLUGIN_FILES = ["datme.config.mjs", "datme.config.js"]

/** What a code block renderer is told about where its block is. */
export interface CodeBlockContext {
  /** The language of the page being built. */
  lang: string
  /** Vault key of the note holding the block. */
  key: string
  /** The rest of the fence's first line, after the language. */
  meta: string
}

/** Renders the source of a fenced block into HTML. */
export type CodeBlockRenderer = (source: string, context: CodeBlockContext) => string | Promise<string>

export interface UserPlugins {
  remark: PluggableList
  rehype: PluggableList
  /** Renderers by fence language, lower-cased. */
  codeBlocks: Map<string, CodeBlockRenderer>
  /** HTML added to the `<head>` of every page. */
  head: string
  /** Names of the bundled plugins, for messages. */
  names: string[]
  /** Changes whenever the file does, to key cached pages. */
  signature: string
}

export const NO_PLUGINS: UserPlugins = { remark: [], rehype: [], codeBlocks: new Map(), head: "", names: [], signature: "" }

export function pluginFile(vault: string): string | undefined {
  return PLUGIN_FILES.map((f) => path.join(vault, f)).find((f) => fs.existsSync(f))
}

interface PluginShape {
  name?: unknown
  remarkPlugins?: unknown
  rehypePlugins?: unknown
  codeBlocks?: unknown
  head?: unknown
  plugins?: unknown
}

/** Check one config or plugin object and add its parts to `out`. */
function collect(config: PluginShape, where: string, out: UserPlugins, depth = 0): void {
  const list = (v: unknown, name: string): PluggableList => {
    if (v == null) return []
    if (!Array.isArray(v)) throw new Error(`${where}: ${name} must be a list of plugins`)
    for (const p of v) {
      const fn = Array.isArray(p) ? p[0] : p
      if (typeof fn !== "function") throw new Error(`${where}: every entry of ${name} must be a plugin function or [plugin, options]`)
    }
    return v as PluggableList
  }
  out.remark.push(...list(config.remarkPlugins, "remarkPlugins"))
  out.rehype.push(...list(config.rehypePlugins, "rehypePlugins"))

  if (config.codeBlocks != null) {
    if (typeof config.codeBlocks !== "object" || Array.isArray(config.codeBlocks)) {
      throw new Error(`${where}: codeBlocks must map a fence language to a function`)
    }
    for (const [lang, fn] of Object.entries(config.codeBlocks)) {
      if (typeof fn !== "function") throw new Error(`${where}: codeBlocks.${lang} must be a function (source, context) => html`)
      const key = lang.toLowerCase()
      if (out.codeBlocks.has(key)) throw new Error(`${where}: codeBlocks.${lang} is already rendered by another plugin`)
      out.codeBlocks.set(key, fn as CodeBlockRenderer)
    }
  }

  if (config.head != null) {
    const parts = Array.isArray(config.head) ? config.head : [config.head]
    if (!parts.every((h) => typeof h === "string")) throw new Error(`${where}: head must be HTML, as a string or a list of strings`)
    out.head += parts.join("\n") + "\n"
  }

  if (config.plugins != null) {
    if (!Array.isArray(config.plugins)) throw new Error(`${where}: plugins must be a list`)
    if (depth > 4) throw new Error(`${where}: plugins are nested too deeply`)
    config.plugins.forEach((p, i) => {
      if (!p || typeof p !== "object") throw new Error(`${where}: plugins[${i}] must be an object, such as the result of calling the plugin`)
      const name = typeof (p as PluginShape).name === "string" ? ((p as PluginShape).name as string) : `plugins[${i}]`
      out.names.push(name)
      collect(p as PluginShape, `${where} (${name})`, out, depth + 1)
    })
  }
}

export async function loadUserPlugins(vault: string): Promise<UserPlugins> {
  const file = pluginFile(vault)
  if (!file) return NO_PLUGINS
  const source = fs.readFileSync(file)
  let mod: { default?: unknown }
  try {
    // The query makes a changed file load again in `datme dev`.
    const url = `${pathToFileURL(file).href}?v=${crypto.createHash("sha1").update(source).digest("hex").slice(0, 8)}`
    mod = await import(/* @vite-ignore */ url)
  } catch (e) {
    throw new Error(`Cannot load ${file}: ${(e as Error).message}`)
  }
  const config = (mod.default ?? mod) as PluginShape
  const out: UserPlugins = {
    remark: [],
    rehype: [],
    codeBlocks: new Map(),
    head: "",
    names: [],
    signature: "",
  }
  collect(config, file, out)
  // Plugins from packages can change while the file does not: their code keys the cache too.
  const code = (p: PluggableList) => p.map((x) => String(Array.isArray(x) ? x[0] : x))
  out.signature = crypto
    .createHash("sha256")
    .update(source)
    .update(JSON.stringify([out.names, code(out.remark), code(out.rehype), [...out.codeBlocks].map(([k, f]) => k + String(f)), out.head]))
    .digest("hex")
  return out
}
