import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import { lucideSvg } from "../src/lib/icons"
import { render, target } from "../tools/lucide-icons"

describe("the Lucide icons datme ships", () => {
  test("are every icon of the lucide-static in devDependencies: run `bun tools/lucide-icons.ts` when this fails", () => {
    expect(fs.readFileSync(target, "utf8")).toBe(render())
  })

  test("include the ones datme draws on its own, and nothing from Object's prototype", () => {
    expect(lucideSvg("file")).toContain("<path")
    expect(lucideSvg("constructor")).toBeUndefined()
  })
})
