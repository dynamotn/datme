/**
 * Screenshots of the documentation garden for the README: builds docs/, serves
 * it, and captures a few views with Playwright's Chromium into
 * docs/assets/screenshots/. Run with `bun run screenshots` after
 * `bunx playwright install chromium`.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { chromium, type Page } from "playwright"

const root = path.resolve(import.meta.dir, "..")
const outDir = path.join(root, "docs/assets/screenshots")
const site = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "datme-shots-")), "site")

const build = Bun.spawnSync(["bun", "bin/datme.ts", "build", "docs", "--out", site, "--fresh"], {
  cwd: root,
  env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "" },
  stdout: "inherit",
  stderr: "inherit",
})
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname)
    for (const candidate of [p, path.join(p, "index.html"), `${p}.html`]) {
      const file = Bun.file(path.join(site, candidate))
      if ((await file.exists()) && !candidate.endsWith("/")) return new Response(file)
    }
    return new Response(Bun.file(path.join(site, "404.html")), { status: 404 })
  },
})
const base = `http://localhost:${server.port}`

interface Shot {
  name: string
  url: string
  theme: "light" | "dark"
  /** Done after the page loads, before the capture. */
  act?: (page: Page) => Promise<void>
}

const shots: Shot[] = [
  { name: "home", url: "/", theme: "light" },
  { name: "note-dark", url: "/showcase/Callouts-and-math", theme: "dark" },
  {
    name: "graph",
    url: "/showcase/Showcase",
    theme: "dark",
    act: async (page) => {
      await page.keyboard.press("Control+g")
      await page.waitForTimeout(2500)
    },
  },
  { name: "slides", url: "/showcase/A-slide-deck", theme: "light" },
  { name: "drawing", url: "/showcase/Sketch.excalidraw", theme: "light" },
  {
    name: "search",
    url: "/",
    theme: "light",
    act: async (page) => {
      await page.keyboard.press("Control+k")
      await page.keyboard.type("garden", { delay: 60 })
      await page.waitForTimeout(800)
    },
  },
]

fs.mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()
try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: shot.theme })
    await page.addInitScript((theme) => localStorage.setItem("theme", theme), shot.theme)
    await page.goto(base + shot.url, { waitUntil: "networkidle" })
    await page.waitForTimeout(600)
    await shot.act?.(page)
    const file = path.join(outDir, `${shot.name}.png`)
    await page.screenshot({ path: file })
    console.log(`📸 ${path.relative(root, file)}`)
    await page.close()
  }
} finally {
  await browser.close()
  server.stop()
  fs.rmSync(path.dirname(site), { recursive: true, force: true })
}
