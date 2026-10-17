import { load, JSON_SCHEMA } from "js-yaml"

/**
 * A YAML document, or null when it holds nothing but blank lines and comments,
 * which js-yaml refuses as "expected a document". `json` keeps dates as strings.
 */
export function parseYaml(src: string, { json = false }: { json?: boolean } = {}): unknown {
  if (!src.replace(/^\s*#.*$/gm, "").trim()) return null
  return load(src, json ? { schema: JSON_SCHEMA } : undefined)
}
