import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { lucideSvg } from "../src/lib/icons"
import { cli, render, target } from "../tools/lucide-icons"

describe("the Lucide icons datme ships", () => {
  test("are every icon of the lucide-static in devDependencies: run `bun tools/lucide-icons.ts` when this fails", () => {
    expect(fs.readFileSync(target, "utf8")).toBe(render())
  })

  test("cli writes the generated file", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lucide-")), "lucide-icons.ts")
    expect(cli(file)).toBe(0)
    expect(fs.readFileSync(file, "utf8")).toBe(render())
  })

  test("include the ones datme draws on its own, and nothing from Object's prototype", () => {
    expect(lucideSvg("file")).toContain("<path")
    expect(lucideSvg("constructor")).toBeUndefined()
  })
})
