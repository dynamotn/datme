/**
 * Writes schema/datme.schema.json, the JSON Schema of datme.yaml, from the zod schema of src/lib/config-schema.ts.
 * zod carries no descriptions, so each key's comes from its JSDoc comment, read with the TypeScript compiler.
 * Run with `bun tools/config-schema.ts`; tests/config-schema.test.ts fails when the file is out of date.
 */
import fs from "node:fs"
import path from "node:path"
import ts from "typescript"
import { z } from "astro/zod"
import { makeSchema, STYLES } from "../src/lib/config-schema"
import { SCHEMA_URL } from "../src/lib/config-files"

const root = path.resolve(import.meta.dir, "..")
const SOURCE = path.join(root, "src/lib/config-schema.ts")
export const SCHEMA_FILE = path.join(root, "schema/datme.schema.json")

/** The parts of a JSON Schema node that descriptions are attached through. */
type Json = {
  description?: string
  properties?: Record<string, Json>
  anyOf?: Json[]
  oneOf?: Json[]
  items?: Json
  additionalProperties?: Json | boolean
  [key: string]: unknown
}

/** The JSDoc of every key inside makeSchema, by key path (`theme.fonts`). Keys of `themeFields` are spread where it is. */
function docs(): Map<string, string> {
  const file = ts.createSourceFile(SOURCE, fs.readFileSync(SOURCE, "utf8"), ts.ScriptTarget.Latest, true)
  const out = new Map<string, string>()
  const spreadable = new Map<string, ts.ObjectLiteralExpression>()
  file.forEachChild((n) => {
    if (!ts.isVariableStatement(n)) return
    for (const d of n.declarationList.declarations) {
      const init = d.initializer && ts.isSatisfiesExpression(d.initializer) ? d.initializer.expression : d.initializer
      if (ts.isIdentifier(d.name) && init && ts.isObjectLiteralExpression(init)) spreadable.set(d.name.text, init)
    }
  })
  const visit = (node: ts.Node, prefix: string[]): void => {
    if (ts.isObjectLiteralExpression(node)) {
      for (const p of node.properties) {
        if (ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression) && spreadable.has(p.expression.text)) visit(spreadable.get(p.expression.text)!, prefix)
        if (!ts.isPropertyAssignment(p)) continue
        const key = [...prefix, p.name.getText(file).replace(/^["']|["']$/g, "")]
        const doc = ts.getJSDocCommentsAndTags(p).find(ts.isJSDoc)?.comment
        if (typeof doc === "string") out.set(key.join("."), doc.replace(/\s*\n\s*/g, " ").trim())
        visit(p.initializer, key)
      }
      return
    }
    ts.forEachChild(node, (c) => visit(c, prefix))
  }
  file.forEachChild((n) => {
    if (ts.isVariableStatement(n) && n.declarationList.declarations.some((d) => d.name.getText(file) === "makeSchema")) visit(n, [])
  })
  return out
}

/** Sets `description` on every schema reached by `keys`, looking through unions, arrays and records. */
function describe(schema: Json, keys: string[], text: string): void {
  if (keys.length === 0) {
    schema.description ??= text
    return
  }
  const [head, ...rest] = keys
  if (schema.properties?.[head]) describe(schema.properties[head], rest, text)
  for (const sub of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), schema.items, schema.additionalProperties]) {
    if (sub && typeof sub === "object") describe(sub, keys, text)
  }
}

/** The JSON Schema of what an author writes in datme.yaml (input side: defaults and transforms are not applied). */
export function generateSchema(): Json {
  const schema = z.toJSONSchema(makeSchema(STYLES as unknown as [string, ...string[]]), { io: "input", unrepresentable: "any" }) as Json
  schema.$id = SCHEMA_URL
  schema.title = "datme.yaml"
  for (const [key, text] of docs()) describe(schema, key.split("."), text)
  return schema
}

export const render = (): string => `${JSON.stringify(generateSchema(), null, 2)}\n`

/** Writes the schema file; the exit code. */
export function cli(file = SCHEMA_FILE): number {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, render())
  console.log(`Wrote ${path.relative(root, file)}`)
  return 0
}

if (import.meta.main) process.exitCode = cli()
