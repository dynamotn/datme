import { expect, test } from "bun:test"
import fs from "node:fs"
import { render, SCHEMA_FILE } from "../tools/config-schema"
import { starterConfig } from "../src/cli"
import { SCHEMA_URL } from "../src/lib/config-files"

test("schema/datme.schema.json is up to date with the zod schema (run `bun tools/config-schema.ts`)", () => {
  expect(fs.readFileSync(SCHEMA_FILE, "utf8")).toBe(render())
})

test("the schema describes keys from their doc comments", () => {
  const schema = JSON.parse(render())
  expect(schema.$id).toBe(SCHEMA_URL)
  expect(schema.properties.publish.description).toContain("only notes with")
  expect(schema.properties.theme.properties.scheme.description).toContain("Colour scheme")
})

test("a new datme.yaml points editors at the schema", () => {
  expect(starterConfig("/v").split("\n")[0]).toBe(`# yaml-language-server: $schema=${SCHEMA_URL}`)
})
