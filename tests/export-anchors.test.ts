import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadConfig, site } from "../src/site.config"
import { exportHtml } from "../src/lib/export"

// A vault of its own: two chapters with the same footnote and the same heading.
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "datme-export-anchors-")))
fs.mkdirSync(path.join(tmp, "Book"))
fs.writeFileSync(path.join(tmp, "datme.yaml"), "publish: all\nlanguages: [en-US]\n")
fs.writeFileSync(path.join(tmp, "Book/A.md"), "One[^1], then [[B#Intro]].\n\n## Intro\n\n[^1]: First note.\n")
fs.writeFileSync(path.join(tmp, "Book/B.md"), "Two[^1].\n\n## Intro\n\n[^1]: Second note.\n")

const saved = { ...site }
const g = globalThis as { __vaultVersion?: number }
const config = loadConfig(tmp, {})
for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
Object.assign(site, config)
g.__vaultVersion = (g.__vaultVersion ?? 0) + 1

afterAll(() => {
  for (const k of Object.keys(site)) delete (site as Record<string, unknown>)[k]
  Object.assign(site, saved)
  g.__vaultVersion = (g.__vaultVersion ?? 0) + 1
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("one-page export", () => {
  test("chapters joined in one page keep their ids apart, and each anchor link finds its own target", async () => {
    const html = await exportHtml("Book", "en-US")
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    const targets = [...html.matchAll(/\shref="#([^"]+)"/g)].map((m) => m[1])
    expect(targets.filter((t) => !ids.includes(t))).toEqual([])
    // Footnote 1 of the second chapter is its own, and a link to a heading of another chapter lands there.
    expect(html).toContain('href="#chapter-2-user-content-fn-1"')
    expect(html).toContain('href="#chapter-2-intro"')
  })
})
