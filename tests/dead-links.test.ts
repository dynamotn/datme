import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readDeadLinks, writeDeadLinks, deadLinksStamp, archiveUrl, DEAD_LINKS_FILE } from "../src/lib/dead-links"
import { renderMarkdown } from "../src/lib/markdown"
import { pruneCache } from "../src/cli"

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datme-dead-"))
afterAll(() => {
  delete process.env.DATME_CACHE
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("dead links", () => {
  test("a recent check is trusted, an old one is not", () => {
    writeDeadLinks(dir, ["https://gone.example/a", "https://gone.example/a"], 1_000)
    expect([...readDeadLinks(dir, 2_000)]).toEqual(["https://gone.example/a"])
    expect(deadLinksStamp(dir, 2_000)).toBe("1000")
    expect(readDeadLinks(dir, 1_000 + 31 * 86_400_000).size).toBe(0)
    expect(readDeadLinks(path.join(dir, "nowhere")).size).toBe(0)
  })

  test("pages point dead links at the Internet Archive, the original in the title", async () => {
    writeDeadLinks(dir, ["https://gone.example/a"])
    process.env.DATME_CACHE = dir
    const html = await renderMarkdown("[old](https://gone.example/a) and [live](https://live.example/)", "en-US", "x")
    expect(html).toContain(`href="${archiveUrl("https://gone.example/a")}"`)
    expect(html).toContain('title="Archived copy, the original is gone: https://gone.example/a"')
    expect(html).toContain('class="external archived"')
    expect(html).toContain('href="https://live.example/"')
  })

  test("pruning the build cache keeps the findings", () => {
    pruneCache(dir, Date.now() + 60_000)
    expect(fs.existsSync(path.join(dir, DEAD_LINKS_FILE))).toBe(true)
  })
})
