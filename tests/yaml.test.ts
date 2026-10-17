import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseYaml } from "../src/lib/yaml"
import { loadConfig } from "../src/site.config"
import { parseGraph } from "../src/lib/contribution-graph"

describe("parseYaml", () => {
  test("an empty or comment-only document holds nothing, where js-yaml would throw", () => {
    expect(parseYaml("")).toBeNull()
    expect(parseYaml("  \n\n")).toBeNull()
    expect(parseYaml("# just a note\n  # and another\n")).toBeNull()
  })

  test("a document is parsed, with the schema asked for", () => {
    expect(parseYaml("a: 1\n# b\nc: [x]")).toEqual({ a: 1, c: ["x"] })
    expect(parseYaml("d: 2024-01-02", { json: true })).toEqual({ d: "2024-01-02" })
  })

  test("invalid YAML still throws", () => {
    expect(() => parseYaml("a: [")).toThrow()
  })
})

describe("empty YAML documents", () => {
  test("a datme.yaml holding only comments gives the defaults", () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), "datme-yaml-"))
    try {
      fs.writeFileSync(path.join(vault, "datme.yaml"), "# settings go here\n")
      expect(loadConfig(vault, {}).vault).toBe(vault)
    } finally {
      fs.rmSync(vault, { recursive: true, force: true })
    }
  })

  test("an empty contribution graph block gets the plugin's defaults", () => {
    expect(parseGraph("", new Date("2024-06-30T00:00:00Z"))).toMatchObject({ to: "2024-06-30", type: "PAGE" })
  })
})
