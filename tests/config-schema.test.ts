import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { cli, render, SCHEMA_FILE } from "../tools/config-schema"
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

test("cli writes the schema file", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "schema-")), "out/datme.schema.json")
  expect(cli(file)).toBe(0)
  expect(fs.readFileSync(file, "utf8")).toBe(render())
})
